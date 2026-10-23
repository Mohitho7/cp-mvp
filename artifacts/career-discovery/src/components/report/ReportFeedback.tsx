import { useState, useEffect } from "react";
import { Star, Check, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import {
  useGetCareerFeedback,
  useSubmitCareerFeedback,
  getGetCareerFeedbackQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export interface ReportFeedbackProps {
  submissionId: string;
}

export const RATING_LEVELS = [
  { value: 1, label: "Not useful", description: "1 star — Not useful" },
  { value: 2, label: "Slightly useful", description: "2 stars — Slightly useful" },
  { value: 3, label: "Somewhat useful", description: "3 stars — Somewhat useful" },
  { value: 4, label: "Very useful", description: "4 stars — Very useful" },
  { value: 5, label: "Extremely useful", description: "5 stars — Extremely useful" },
] as const;

export function ReportFeedback({ submissionId }: ReportFeedbackProps) {
  const queryClient = useQueryClient();
  const feedbackQuery = useGetCareerFeedback(submissionId);
  const submitMutation = useSubmitCareerFeedback();

  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);

  useEffect(() => {
    if (feedbackQuery.data?.feedback && !hasLoadedInitial) {
      const saved = feedbackQuery.data.feedback;
      setRating(saved.rating);
      setComment(saved.comment || "");
      setIsSaved(true);
      setHasLoadedInitial(true);
    } else if (feedbackQuery.isSuccess && !hasLoadedInitial) {
      setHasLoadedInitial(true);
    }
  }, [feedbackQuery.data, feedbackQuery.isSuccess, hasLoadedInitial]);

  const activeRating = hoverRating ?? rating;
  const activeLevel = RATING_LEVELS.find((l) => l.value === activeRating);
  const selectedLevel = RATING_LEVELS.find((l) => l.value === rating);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;

    setErrorMessage(null);
    submitMutation.mutate(
      {
        id: submissionId,
        data: {
          rating,
          comment: comment.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setIsSaved(true);
          setErrorMessage(null);
          void queryClient.invalidateQueries({
            queryKey: getGetCareerFeedbackQueryKey(submissionId),
          });
        },
        onError: (err: unknown) => {
          const status = (err as { status?: number })?.status;
          if (status === 400) {
            setErrorMessage("Please select a valid rating between 1 and 5 and keep your comment under 500 characters.");
          } else if (status === 401) {
            setErrorMessage("Please sign in again to submit your feedback.");
          } else {
            setErrorMessage("We couldn't save your feedback. Your responses are still here—please try again.");
          }
        },
      },
    );
  };

  return (
    <section
      className="report-feedback-section"
      data-testid="section-report-feedback"
      aria-labelledby="report-feedback-heading"
      style={{
        marginTop: "3.5rem",
        paddingTop: "2.5rem",
        borderTop: "1px solid var(--cp-border-subtle, #E6EAE3)",
      }}
    >
      <div
        className="card report-feedback-card"
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--cp-border, #D9DED5)",
          borderRadius: "18px",
          padding: "clamp(24px, 4vw, 36px)",
          maxWidth: "760px",
          margin: "0 auto",
          boxShadow: "0 2px 8px rgba(23, 26, 21, 0.04)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <span
            className="tag"
            style={{
              color: "#8F7220",
              letterSpacing: "0.12em",
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            STUDENT FEEDBACK
          </span>
          <h2
            id="report-feedback-heading"
            style={{
              fontFamily: "var(--font-display, 'Playfair Display', Georgia, serif)",
              fontSize: "clamp(1.4rem, 3.2vw, 1.85rem)",
              fontWeight: 700,
              color: "#171A15",
              lineHeight: 1.25,
              marginBottom: "0.6rem",
            }}
          >
            How useful was your career report?
          </h2>
          <p
            style={{
              color: "var(--cp-muted, #60665B)",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              maxWidth: "520px",
              margin: "0 auto",
            }}
          >
            Your feedback helps us make Career Pathfinder more useful for students.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Star selector */}
          <div
            role="radiogroup"
            aria-label="How useful was your career report rating"
            data-testid="rating-star-group"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "0.6rem",
              marginBottom: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            {RATING_LEVELS.map((level) => {
              const isFilled = activeRating !== null && level.value <= activeRating;
              const isSelected = rating === level.value;

              return (
                <button
                  key={level.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={level.description}
                  data-testid={`button-rating-star-${level.value}`}
                  onClick={() => {
                    setRating(level.value);
                    setIsSaved(false);
                    setErrorMessage(null);
                  }}
                  onMouseEnter={() => setHoverRating(level.value)}
                  onMouseLeave={() => setHoverRating(null)}
                  onFocus={() => setHoverRating(level.value)}
                  onBlur={() => setHoverRating(null)}
                  style={{
                    background: isSelected ? "var(--cp-primary-soft, #FBF4DE)" : "#FCFAF6",
                    border: isSelected ? "2px solid #E7B93F" : "1.5px solid #D9DED5",
                    borderRadius: "12px",
                    width: "56px",
                    height: "56px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.16s ease",
                    padding: 0,
                    outline: "none",
                  }}
                >
                  <Star
                    size={28}
                    fill={isFilled ? "#E7B93F" : "transparent"}
                    color={isFilled ? "#DFB235" : "#889082"}
                    strokeWidth={isFilled ? 1.5 : 1.25}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>

          {/* Selected rating state descriptor */}
          <div
            style={{
              textAlign: "center",
              minHeight: "1.6rem",
              marginBottom: "1.5rem",
            }}
          >
            {activeLevel ? (
              <span
                data-testid="selected-rating-description"
                style={{
                  fontFamily: "var(--font-mono, 'DM Mono', monospace)",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: "#8F7220",
                  background: "#FFFDF8",
                  padding: "0.3rem 0.9rem",
                  borderRadius: "50px",
                  border: "1px solid #E6EAE3",
                  display: "inline-block",
                }}
              >
                {activeLevel.description}
              </span>
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-mono, 'DM Mono', monospace)",
                  fontSize: "0.82rem",
                  color: "#889082",
                }}
              >
                Select 1 to 5 stars to rate this report
              </span>
            )}
          </div>

          {/* Optional comment box */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="report-feedback-comment"
              style={{
                display: "block",
                fontFamily: "var(--font-body, 'Plus Jakarta Sans', sans-serif)",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#171A15",
                marginBottom: "0.5rem",
              }}
            >
              What should we improve?{" "}
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--cp-muted, #60665B)",
                  fontSize: "0.85rem",
                }}
              >
                (Optional)
              </span>
            </label>
            <textarea
              id="report-feedback-comment"
              data-testid="textarea-feedback-comment"
              rows={4}
              maxLength={500}
              placeholder="Tell us what was most helpful, what was unclear, or what specific guidance you would like to see added..."
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setIsSaved(false);
                setErrorMessage(null);
              }}
              style={{
                background: "#FCFAF6",
                border: "1.5px solid var(--cp-border, #D9DED5)",
                borderRadius: "12px",
                color: "#171A15",
                fontFamily: "var(--font-body, 'Plus Jakarta Sans', sans-serif)",
                fontSize: "0.9rem",
                padding: "0.9rem",
                width: "100%",
                resize: "vertical",
                lineHeight: 1.6,
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "0.35rem",
              }}
            >
              <span
                className="tag"
                data-testid="feedback-character-counter"
                style={{
                  color: comment.length >= 480 ? "#C55B5B" : "#889082",
                  fontSize: "0.75rem",
                }}
              >
                {comment.length} / 500
              </span>
            </div>
          </div>

          {/* Success state */}
          {isSaved && !submitMutation.isPending && (
            <div
              role="status"
              data-testid="feedback-success-message"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "#F4FAF6",
                border: "1px solid #C3E6D3",
                borderRadius: "12px",
                padding: "0.8rem 1.1rem",
                marginBottom: "1.25rem",
                color: "#1E5437",
                fontSize: "0.88rem",
                fontWeight: 500,
              }}
            >
              <Check size={18} style={{ color: "#1E5437", flexShrink: 0 }} />
              <span>
                Thank you! Your feedback has been saved. You can update it anytime.
              </span>
            </div>
          )}

          {/* Error state */}
          {errorMessage && (
            <div
              role="alert"
              data-testid="feedback-error-message"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
                background: "#FDF4F4",
                border: "1px solid #F5C6C6",
                borderRadius: "12px",
                padding: "0.8rem 1.1rem",
                marginBottom: "1.25rem",
                color: "#9C2B2B",
                fontSize: "0.88rem",
              }}
            >
              <AlertCircle size={18} style={{ color: "#C55B5B", flexShrink: 0, marginTop: "2px" }} />
              <div style={{ flex: 1 }}>
                <span>{errorMessage}</span>
                <div style={{ marginTop: "0.4rem" }}>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    data-testid="button-retry-feedback"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#8F7220",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "0.85rem",
                      textDecoration: "underline",
                    }}
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action button */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem" }}>
            {selectedLevel && (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: "var(--cp-muted, #60665B)",
                }}
              >
                Ready to submit rating: <strong>{selectedLevel.label}</strong>
              </span>
            )}
            <button
              type="submit"
              disabled={!rating || submitMutation.isPending}
              data-testid="button-submit-feedback"
              className="button button-primary"
              style={{
                padding: "0.85rem 1.8rem",
                fontSize: "0.92rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "50px",
                opacity: !rating || submitMutation.isPending ? 0.45 : 1,
                cursor: !rating || submitMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Saving feedback…
                </>
              ) : isSaved ? (
                "Update feedback"
              ) : (
                "Submit feedback"
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
