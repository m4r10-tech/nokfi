#!/usr/bin/env bash
# ==========================================================================
# Nokfi — comprobación post-deploy (sesión 4, §2.5)
# --------------------------------------------------------------------------
# Verifica que producción sirve EXACTAMENTE el build recién subido (mismo
# index-*.js que frontend/dist) y que la API responde. Habría detectado al
# momento el caso "el fix está desplegado pero prod sirve el bundle viejo".
#
# Uso (desde la raíz del repo, tras el rsync del dist):
#   deploy/smoke-deploy.sh            # contra https://nokfi.app
#   deploy/smoke-deploy.sh https://staging.ejemplo
# ==========================================================================
set -euo pipefail
BASE="${1:-https://nokfi.app}"
DIST="$(dirname "$0")/../frontend/dist/index.html"
fail=0
ok()  { echo "✅ $*"; }
bad() { echo "❌ $*"; fail=1; }

local_js=$(grep -o 'assets/index-[^"]*\.js' "$DIST" | head -1)
remote_js=$(curl -fsS -H 'Cache-Control: no-cache' "$BASE/home?smoke=$(date +%s)" | grep -o 'assets/index-[^"]*\.js' | head -1 || true)
if [ -n "$local_js" ] && [ "$local_js" = "$remote_js" ]; then ok "bundle servido = dist local ($local_js)"; else bad "bundle distinto: local=$local_js remoto=${remote_js:-ninguno}"; fi

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$local_js"); [ "$code" = 200 ] && ok "chunk principal accesible" || bad "chunk principal → HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/payments/plans"); [ "$code" = 200 ] && ok "API /api/payments/plans 200" || bad "API plans → HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/geo"); [ "$code" = 200 ] && ok "API /api/geo 200" || bad "API geo → HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/openapi.json"); [ "$code" = 200 ] && ok "API v1 openapi 200" || bad "openapi → HTTP $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/proxy/ai"); [ "$code" = 410 ] && ok "proxy antiguo cerrado (410)" || bad "proxy antiguo → HTTP $code (esperado 410)"
csp=$(curl -sI "$BASE/home" | grep -i '^content-security-policy' || true)
[ -n "$csp" ] && ok "cabecera CSP presente" || bad "falta la cabecera CSP"
echo "$csp" | grep -q "worker-src" && ok "CSP con worker-src" || echo "⚠️  CSP sin worker-src (aplica deploy/nginx-nokfi.conf con sudo)"

exit $fail
