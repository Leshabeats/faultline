import type { Locale } from '../domain/system'

export const workspaceCopy: Record<Locale, {
  interview: string
  workspace: string
  defaultTitle: string
  titleLabel: string
  saved: string
  saving: string
  saveFailed: string
  storedLocally: string
  export: string
  exportTitle: string
  exportHelper: string
  exportHint: string
  exportFailed: string
  modeLabel: string
  switchLocale: string
  closeExport: string
  formats: Record<'png' | 'svg' | 'markdown' | 'json', { title: string; description: string }>
  notes: string
  notesPlaceholder: string
  notesHelp: string
  capacity: string
  componentName: string
  componentContext: string
  statusAnnouncement: Record<'saved' | 'saving' | 'error', string>
  infrastructure: string
}> = {
  en: {
    interview: 'Interview',
    workspace: 'Workspace',
    defaultTitle: 'System architecture',
    titleLabel: 'Workspace title',
    saved: 'Saved just now',
    saving: 'Saving…',
    saveFailed: 'Could not save locally',
    storedLocally: 'Changes are stored on this device',
    export: 'Export',
    exportTitle: 'Export workspace',
    exportHelper: 'Share the architecture with your team.',
    exportHint: 'Exports include the current load, topology, and capacity assumptions.',
    exportFailed: 'Export failed. Your workspace is still saved locally.',
    modeLabel: 'Faultline mode',
    switchLocale: 'Switch to Russian',
    closeExport: 'Close export',
    formats: {
      png: { title: 'PNG image', description: 'For docs, chat, and presentations' },
      svg: { title: 'SVG diagram', description: 'Crisp and editable in design tools' },
      markdown: { title: 'Markdown brief', description: 'Components, connections, and assumptions' },
      json: { title: 'Faultline JSON', description: 'Portable editable workspace data' },
    },
    notes: 'Notes',
    notesPlaceholder: 'Add context, assumptions, or open questions…',
    notesHelp: 'Included in Markdown and JSON exports.',
    capacity: 'Capacity',
    componentName: 'Component name',
    componentContext: 'Component context',
    statusAnnouncement: {
      saved: 'Changes saved locally.',
      saving: 'Saving changes.',
      error: 'Changes could not be saved.',
    },
    infrastructure: 'Infra / mo',
  },
  ru: {
    interview: 'Интервью',
    workspace: 'Доска',
    defaultTitle: 'Архитектура системы',
    titleLabel: 'Название доски',
    saved: 'Только что сохранено',
    saving: 'Сохраняю…',
    saveFailed: 'Не удалось сохранить локально',
    storedLocally: 'Изменения хранятся на этом устройстве',
    export: 'Экспорт',
    exportTitle: 'Экспорт доски',
    exportHelper: 'Поделитесь архитектурой с командой.',
    exportHint: 'В экспорт входят текущая нагрузка, топология и допущения по ёмкости.',
    exportFailed: 'Не удалось экспортировать. Доска по-прежнему сохранена локально.',
    modeLabel: 'Режим Faultline',
    switchLocale: 'Переключить на английский',
    closeExport: 'Закрыть экспорт',
    formats: {
      png: { title: 'Изображение PNG', description: 'Для документации, чатов и презентаций' },
      svg: { title: 'Диаграмма SVG', description: 'Чёткая графика для дизайн-инструментов' },
      markdown: { title: 'Описание Markdown', description: 'Компоненты, связи и допущения' },
      json: { title: 'Faultline JSON', description: 'Переносимые данные редактируемой доски' },
    },
    notes: 'Заметки',
    notesPlaceholder: 'Добавьте контекст, допущения или открытые вопросы…',
    notesHelp: 'Попадут в экспорт Markdown и JSON.',
    capacity: 'Ёмкость',
    componentName: 'Название компонента',
    componentContext: 'Контекст компонента',
    statusAnnouncement: {
      saved: 'Изменения сохранены локально.',
      saving: 'Изменения сохраняются.',
      error: 'Не удалось сохранить изменения.',
    },
    infrastructure: 'Инфра / мес.',
  },
}
