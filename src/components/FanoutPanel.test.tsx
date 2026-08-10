import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NEWS_FEED_TUNING, estimateNewsFeed } from '../newsFeed/model'
import { FanoutPanel } from './FanoutPanel'

describe('FanoutPanel localization', () => {
  it('renders the post-prediction journey in Russian', () => {
    const baseline = estimateNewsFeed({
      loadMultiplier: 10,
      fault: 'celebrity-spike',
      tuning: DEFAULT_NEWS_FEED_TUNING,
    })
    const markup = renderToStaticMarkup(
      <FanoutPanel
        open
        locale="ru"
        tuning={DEFAULT_NEWS_FEED_TUNING}
        report={baseline}
        baseline={baseline}
        prediction={baseline.bottleneck}
        rationale="Очередь не успеет разгрузиться"
        predictionLocked
        onPredictionChange={() => undefined}
        onRationaleChange={() => undefined}
        onCommitPrediction={() => undefined}
        onTuningChange={() => undefined}
        onDefend={() => undefined}
        onReset={() => undefined}
        onOpenInterviewer={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(markup).toContain('Прогноз подтвердился')
    expect(markup).toContain('Оценка')
    expect(markup).toContain('При записи')
    expect(markup).toContain('Загрузка воркеров')
    expect(markup).not.toContain('Prediction holds')
    expect(markup).not.toContain('Estimated')
    expect(markup).not.toContain('Worker load')
    expect(markup).not.toContain('Reset tuning')
  })
})
