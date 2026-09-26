import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Files, RotateCcw, Smartphone } from 'lucide-react';
import { useLang } from '../context/LangContext';
import {
  canPickFolder, supportsDirectoryPicker, pickFolderWithApi, reopenLastFolder, lastFolderName, fromFolderInput, isMobile
} from '../middleware/folderPicker';

/**
 * F3 — origen de archivos: "Abrir carpeta", "Reabrir <última>" (Chrome/Edge)
 * o "Elegir archivos". Llama a onPick({ name, files }).
 */
export default function FolderSource({ accept, inputAccept, slot, onPick, disabled }) {
  const { t } = useLang();
  const folderInput = useRef(null);
  const filesInput = useRef(null);
  const [last, setLast] = useState(null);

  useEffect(() => { if (supportsDirectoryPicker()) lastFolderName(slot).then(setLast); }, [slot]);

  const openFolder = async () => {
    if (supportsDirectoryPicker()) {
      try {
        const res = await pickFolderWithApi(accept, slot);
        setLast(res.name);
        onPick(res);
      } catch (e) { if (e?.name !== 'AbortError') console.error('[Folder]', e); }
    } else folderInput.current?.click();
  };

  const reopen = async () => {
    try {
      const res = await reopenLastFolder(accept, slot);
      if (res) onPick(res);
    } catch (e) { console.error('[Folder]', e); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canPickFolder() && (
          <button type="button" onClick={openFolder} disabled={disabled} className="btn btn-primary">
            <FolderOpen size={16} /> {t('folder.openFolder')}
          </button>
        )}
        {last && (
          <button type="button" onClick={reopen} disabled={disabled} className="btn btn-secondary">
            <RotateCcw size={15} /> {t('folder.reopen').replace('{name}', last)}
          </button>
        )}
        <button type="button" onClick={() => filesInput.current?.click()} disabled={disabled} className={`btn ${canPickFolder() ? 'btn-secondary' : 'btn-primary'}`}>
          <Files size={16} /> {t('folder.chooseFiles')}
        </button>
      </div>
      {isMobile() && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><Smartphone size={13} /> {t('folder.mobileHint')}</p>
      )}
      <input ref={folderInput} type="file" hidden webkitdirectory="" directory="" multiple
        onChange={(e) => { if (e.target.files?.length) onPick(fromFolderInput(e.target.files, accept)); e.target.value = ''; }} />
      <input ref={filesInput} type="file" hidden multiple accept={inputAccept}
        onChange={(e) => { if (e.target.files?.length) onPick({ name: '', files: Array.from(e.target.files).filter(f => accept(f.name)) }); e.target.value = ''; }} />
    </div>
  );
}
