import type { Locale } from '../domain/system'
import type { AppMode } from '../workspace/types'

interface PathCopy {
  eyebrow: string
  title: string
  summary: string
  stepsTitle: string
  steps: Array<{ title: string; detail: string }>
  finishTitle: string
  finishDetail: string
  start: string
}

interface OnboardingCopy {
  close: string
  help: string
  helpAria: string
  progress: (step: number) => string
  introEyebrow: string
  introTitle: string
  introDetail: string
  choosePath: string
  selected: string
  skip: string
  back: string
  next: string
  paths: Record<AppMode, PathCopy>
}

export const onboardingCopy: Record<Locale, OnboardingCopy> = {
  en: {
    close: 'Close quick start',
    help: 'How to use',
    helpAria: 'How to use Faultline',
    progress: (step) => `Quick start · ${step} of 3`,
    introEyebrow: 'Welcome to Faultline',
    introTitle: 'How do you want to use it?',
    introDetail: 'Practice system design under pressure or explore your own architecture. Choose a path — you can switch modes at any time.',
    choosePath: 'Choose a path to continue',
    selected: 'Selected',
    skip: 'Skip for now',
    back: 'Back',
    next: 'Continue',
    paths: {
      interview: {
        eyebrow: 'Guided practice',
        title: 'Solve an interview challenge',
        summary: 'Work from requirements, predict the bottleneck, pressure-test the topology, and defend the trade-offs.',
        stepsTitle: 'Your first run',
        steps: [
          { title: 'Read the brief', detail: 'Open the challenge title to review requirements, scale, and test cases.' },
          { title: 'Commit a prediction', detail: 'Name the first bottleneck and explain why before revealing the model.' },
          { title: 'Pressure-test the design', detail: 'Edit the topology, raise the load, inject an exact failure, and inspect the impact.' },
          { title: 'Submit and replay', detail: 'Run the judge, inspect the score, then replay the decisions that produced it.' },
        ],
        finishTitle: 'Start with the URL Shortener',
        finishDetail: 'The seeded design already runs at 1×. Open the brief first, then make one prediction before changing the architecture.',
        start: 'Start interview',
      },
      workspace: {
        eyebrow: 'Freeform exploration',
        title: 'Explore your own architecture',
        summary: 'Build a freeform diagram, attach assumptions, simulate load and faults, then export a review-ready artifact.',
        stepsTitle: 'Your first workspace',
        steps: [
          { title: 'Shape the system', detail: 'Add components, connect them, and give the workspace a useful name.' },
          { title: 'Add engineering context', detail: 'Select a node to rename it, record notes, and set replicas or shards.' },
          { title: 'Test the assumptions', detail: 'Raise the load, take a component or connection offline, and inspect the blast radius.' },
          { title: 'Take the result with you', detail: 'Export PNG, SVG, Markdown, or editable Faultline JSON.' },
        ],
        finishTitle: 'Your workspace saves automatically',
        finishDetail: 'Changes stay on this device. Start from the current architecture, rename the workspace, and select any node to add context.',
        start: 'Open workspace',
      },
    },
  },
  ru: {
    close: 'Закрыть быстрый старт',
    help: 'Как пользоваться',
    helpAria: 'Как пользоваться Faultline',
    progress: (step) => `Быстрый старт · ${step} из 3`,
    introEyebrow: 'Добро пожаловать в Faultline',
    introTitle: 'Как вы хотите его использовать?',
    introDetail: 'Тренируйте system design под давлением или исследуйте собственную архитектуру. Выберите путь — режим можно сменить в любой момент.',
    choosePath: 'Выберите путь, чтобы продолжить',
    selected: 'Выбрано',
    skip: 'Пока пропустить',
    back: 'Назад',
    next: 'Продолжить',
    paths: {
      interview: {
        eyebrow: 'Тренировка по сценарию',
        title: 'Решить задачу собеседования',
        summary: 'Разберите требования, спрогнозируйте узкое место, испытайте схему и защитите компромиссы.',
        stepsTitle: 'Ваша первая попытка',
        steps: [
          { title: 'Прочитайте условие', detail: 'Откройте название задачи и изучите требования, масштаб и тестовые сценарии.' },
          { title: 'Зафиксируйте прогноз', detail: 'Назовите первое узкое место и объясните причину до раскрытия модели.' },
          { title: 'Испытайте решение', detail: 'Измените топологию, поднимите нагрузку, внесите точный сбой и изучите последствия.' },
          { title: 'Отправьте и воспроизведите', detail: 'Запустите judge, изучите оценку и повторите решения, которые к ней привели.' },
        ],
        finishTitle: 'Начните с сервиса коротких ссылок',
        finishDetail: 'Стартовая схема уже работает при нагрузке 1×. Сначала откройте условие, затем сделайте один прогноз до изменения архитектуры.',
        start: 'Начать интервью',
      },
      workspace: {
        eyebrow: 'Свободное исследование',
        title: 'Разобрать свою архитектуру',
        summary: 'Соберите свободную схему, добавьте допущения, испытайте нагрузкой и сбоями, затем экспортируйте результат.',
        stepsTitle: 'Ваша первая доска',
        steps: [
          { title: 'Соберите систему', detail: 'Добавляйте компоненты, соединяйте их и дайте доске понятное название.' },
          { title: 'Добавьте инженерный контекст', detail: 'Выберите узел, чтобы переименовать его, записать заметки и настроить реплики или шарды.' },
          { title: 'Проверьте допущения', detail: 'Поднимите нагрузку, отключите компонент или связь и изучите радиус поражения.' },
          { title: 'Заберите результат', detail: 'Экспортируйте PNG, SVG, Markdown или редактируемый Faultline JSON.' },
        ],
        finishTitle: 'Доска сохраняется автоматически',
        finishDetail: 'Изменения останутся на этом устройстве. Начните с текущей архитектуры, переименуйте доску и выберите любой узел, чтобы добавить контекст.',
        start: 'Открыть доску',
      },
    },
  },
}
