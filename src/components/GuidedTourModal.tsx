import { useState } from 'react'
import { Compass, Monitor, Smartphone, Volume2, X } from 'lucide-react'
import type { Translations } from '../i18n/translations'

interface GuidedTourModalProps {
  t: Translations
  open: boolean
  onClose: () => void
}

export function GuidedTourModal({ t, open, onClose }: GuidedTourModalProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [targetChoice, setTargetChoice] = useState<'pc' | 'mobile'>('pc')

  if (!open) return null

  const steps = [
    { title: t.tourStep1Title, body: t.tourStep1Body },
    { title: t.tourStep2Title, body: t.tourStep2Body },
    { title: t.tourStep3Title, body: t.tourStep3Body },
    { title: t.tourStep4Title, body: t.tourStep4Body },
    { title: t.tourStep5Title, body: t.tourStep5Prompt, isChoiceStep: true },
  ]

  const current = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1

  const handleClose = () => {
    setStepIdx(0)
    onClose()
  }

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label={t.tourTitle}>
      <div className="panel tour-modal">
        <div className="panel-header">
          <div className="panel-title-group">
            <Compass size={15} className="icon-crimson" />
            <span className="panel-title">{t.tourTitle}</span>
          </div>
          <button type="button" className="pack-remove-btn" onClick={handleClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="tour-progress-dots">
          {steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`tour-dot ${idx === stepIdx ? 'active' : idx < stepIdx ? 'done' : ''}`}
              onClick={() => setStepIdx(idx)}
              aria-label={`Step ${idx + 1}`}
            />
          ))}
        </div>

        <div className="tour-body">
          <h3 className="tour-step-heading">{current.title}</h3>
          <p className="tour-step-text">{current.body}</p>

          {current.isChoiceStep && (
            <div className="tour-choice-wrap">
              <div className="tour-audio-clarification">
                <Volume2 size={14} className="icon-crimson" />
                <span>{t.tourAudioPcOnlyNote}</span>
              </div>

              <div className="tour-choice-buttons">
                <button
                  type="button"
                  className={`btn-export btn-export-toggle ${targetChoice === 'pc' ? 'active' : ''}`}
                  onClick={() => setTargetChoice('pc')}
                >
                  <div className="export-icons">
                    <Monitor size={15} />
                  </div>
                  <span className="export-label">{t.pcColTitle}</span>
                </button>
                <button
                  type="button"
                  className={`btn-export btn-export-toggle ${targetChoice === 'mobile' ? 'active' : ''}`}
                  onClick={() => setTargetChoice('mobile')}
                >
                  <div className="export-icons">
                    <Smartphone size={15} />
                  </div>
                  <span className="export-label">{t.mobileColTitle}</span>
                </button>
              </div>

              <div className="tour-choice-detail">
                <div className="tour-choice-title">
                  {targetChoice === 'pc' ? t.tourPcTitle : t.tourMobileTitle}
                </div>
                <p className="tour-choice-body">
                  {targetChoice === 'pc' ? t.tourPcBody : t.tourMobileBody}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="tour-footer">
          <button
            type="button"
            className="btn-secondary"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          >
            {t.tourPrev}
          </button>

          {!isLast ? (
            <button
              type="button"
              className="btn-crimson"
              onClick={() => setStepIdx((s) => Math.min(steps.length - 1, s + 1))}
            >
              {t.tourNext}
            </button>
          ) : (
            <button type="button" className="btn-crimson" onClick={handleClose}>
              {t.tourDone}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
