export const AUTO_BACKUP_FILE = 'pa-journal-autosave.json'

export type FolderPermission = 'granted' | 'denied' | 'prompt'

interface WritableFile {
  write: (data: Blob | string) => Promise<void>
  close: () => Promise<void>
}

interface AutoBackupFileHandle {
  createWritable: () => Promise<WritableFile>
}

/**
 * The File System Access API is only available in some desktop browsers
 * (Chromium-based). These local types keep the rest of the app independent of
 * whichever DOM lib the TypeScript version happens to ship.
 */
export interface AutoBackupFolder {
  name: string
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<FolderPermission>
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<FolderPermission>
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<AutoBackupFileHandle>
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string
  }) => Promise<AutoBackupFolder>
}

export function supportsAutoBackup(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
}

export async function pickBackupFolder(): Promise<AutoBackupFolder> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) throw new Error('This browser cannot write to a folder on this computer.')
  return picker({ id: 'pa-trading-journal-backup', mode: 'readwrite' })
}

export async function folderPermission(
  folder: AutoBackupFolder,
  request = false,
): Promise<FolderPermission> {
  try {
    if (request) {
      if (!folder.requestPermission) return 'denied'
      return await folder.requestPermission({ mode: 'readwrite' })
    }
    if (!folder.queryPermission) return 'prompt'
    return await folder.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'denied'
  }
}

export async function writeAutoBackup(
  folder: AutoBackupFolder,
  content: string,
): Promise<void> {
  const file = await folder.getFileHandle(AUTO_BACKUP_FILE, { create: true })
  const writable = await file.createWritable()
  await writable.write(new Blob([content], { type: 'application/json' }))
  await writable.close()
}
