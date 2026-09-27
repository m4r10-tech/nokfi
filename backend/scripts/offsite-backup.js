#!/usr/bin/env node
/**
 * scripts/offsite-backup.js — sube una copia de la BD a Cloudflare R2 (fuera del VPS).
 *
 * Lo llama backup-db.sh tras cada copia local verificada. La copia se comprime
 * (gzip) y se CIFRA (AES-256-GCM) antes de salir del servidor: en R2 solo hay
 * datos ilegibles sin BACKUP_ENCRYPTION_KEY. Guarda esa clave también fuera del
 * VPS (gestor de contraseñas): si el VPS se pierde, sin ella no se puede restaurar.
 *
 * Variables (.env): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET, BACKUP_ENCRYPTION_KEY (64 hex = 32 bytes) y opcional R2_JURISDICTION=eu.
 * La retención (p. ej. 30 días) se configura con una regla de ciclo de vida en el bucket.
 *
 * Uso:    node scripts/offsite-backup.js db/backups/nokfi-XXXX.db
 * Restaurar: node scripts/offsite-backup.js --decrypt copia.db.gz.enc salida.db
 * Formato del archivo: "NKB1" | iv(12) | tag(16) | datos cifrados (gzip de la BD).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MAGIC = Buffer.from('NKB1');

function key() {
  const k = String(process.env.BACKUP_ENCRYPTION_KEY || '');
  if (!/^[0-9a-f]{64}$/i.test(k)) throw new Error('BACKUP_ENCRYPTION_KEY debe tener 64 caracteres hex (openssl rand -hex 32)');
  return Buffer.from(k, 'hex');
}

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(zlib.gzipSync(buf, { level: 9 })), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), data]);
}

function decrypt(buf) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('No es una copia de Nokfi (NKB1)');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  return zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(32)), d.final()]));
}

/* ── PUT firmado (AWS Signature V4, API S3 de R2) sin dependencias ── */
const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();

async function putObject(objectKey, body) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error('Faltan variables R2_* en .env');
  const host = `${R2_ACCOUNT_ID}${process.env.R2_JURISDICTION === 'eu' ? '.eu' : ''}.r2.cloudflarestorage.com`;
  const uri = `/${R2_BUCKET}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signed = Object.keys(headers).sort().join(';');
  const canonical = ['PUT', uri, '', Object.keys(headers).sort().map(h => `${h}:${headers[h]}\n`).join(''), signed, payloadHash].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSig = ['auto', 's3', 'aws4_request'].reduce((k, part) => hmac(k, part), hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, day));
  const signature = crypto.createHmac('sha256', kSig).update(toSign).digest('hex');
  const res = await fetch(`https://${host}${uri}`, {
    method: 'PUT',
    headers: {
      'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'content-type': 'application/octet-stream',
      Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signed}, Signature=${signature}`
    },
    body
  });
  if (!res.ok) throw new Error(`R2 respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--decrypt') {
    fs.writeFileSync(args[2], decrypt(fs.readFileSync(args[1])));
    console.log(`[offsite] Descifrada → ${args[2]}`);
    return;
  }
  const file = args[0];
  if (!file || !fs.existsSync(file)) throw new Error('Uso: offsite-backup.js <copia.db>');
  const enc = encrypt(fs.readFileSync(file));
  // Comprobación antes de subir: la copia cifrada se descifra igual que el original.
  if (!decrypt(enc).equals(fs.readFileSync(file))) throw new Error('La verificación del cifrado ha fallado');
  const name = `db/${path.basename(file)}.gz.enc`;
  await putObject(name, enc);
  console.log(`[offsite] OK → r2://${process.env.R2_BUCKET}/${name} (${Math.round(enc.length / 1024)} KB cifrados)`);
}

if (require.main === module) {
  main().catch(e => { console.error(`[offsite] ERROR: ${e.message}`); process.exit(1); });
}

module.exports = { encrypt, decrypt };
