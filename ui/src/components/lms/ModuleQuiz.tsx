import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

interface Question {
  prompt: string;
  options: string[];
  correctIndex: number;
}

interface ModuleQuizProps {
  questions: Question[];
  onSubmit: (answers: number[]) => Promise<{ score: number; passed: boolean; correct: number; total: number }>;
  onContinue: () => void;
}

export function ModuleQuiz({ questions, onSubmit, onContinue }: ModuleQuizProps) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = answers.every(a => a !== null);

  async function handleSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    try {
      const res = await onSubmit(answers as number[]);
      setResult(res);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setAnswers(questions.map(() => null));
    setResult(null);
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className={`p-4 rounded-full ${result.passed ? "bg-green-500/10" : "bg-red-500/10"}`}>
          {result.passed
            ? <CheckCircle2 className="h-10 w-10 text-green-600" />
            : <XCircle className="h-10 w-10 text-red-600" />}
        </div>
        <div className="text-center">
          <p className="text-2xl font-black">{result.score}%</p>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {result.correct} / {result.total} correct
          </p>
        </div>
        {result.passed ? (
          <div className="text-center space-y-3">
            <p className="text-sm font-medium text-green-700">Module Complete!</p>
            <Button onClick={onContinue} className="gap-2">
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">Score 70% or higher to unlock the next module.</p>
            <Button variant="outline" onClick={handleRetry}>Try Again</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
        Quiz — Answer all questions to continue
      </p>
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-2">
          <p className="text-sm font-medium">{qi + 1}. {q.prompt}</p>
          <div className="grid gap-2">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => {
                  const next = [...answers];
                  next[qi] = oi;
                  setAnswers(next);
                }}
                className={`text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                  answers[qi] === oi
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={handleSubmit} disabled={!allAnswered || submitting} className="mt-2">
        {submitting ? "Grading…" : "Submit Quiz"}
      </Button>
    </div>
  );
}
