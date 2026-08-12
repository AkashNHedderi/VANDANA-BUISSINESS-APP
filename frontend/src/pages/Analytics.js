import PageHeader from "@/components/PageHeader";
import AskBox from "@/components/AskBox";

export default function Analytics() {
  return (
    <div className="rise">
      <PageHeader title="ASK MY BUSINESS" subtitle="Ask questions in plain language — answers use your real data" />
      <AskBox variant="full" />
      <p className="text-xs text-muted-foreground mt-4 font-mono">
        Try: "Which product gives me the most profit?" then follow up with "Which customers bought it?"
      </p>
    </div>
  );
}
