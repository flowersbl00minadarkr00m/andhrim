import type { Metadata } from "next";
import { EvaluationLab } from "@/components/EvaluationLab";

export const metadata: Metadata = {
  title: "Evaluation Lab — Andhrím Agent or Not?",
  description: "Local provider-free evaluation scenarios for the Agent or Not prototype.",
};

export default function EvaluationPage() {
  return <EvaluationLab />;
}
