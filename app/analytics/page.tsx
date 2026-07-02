import { redirect } from "next/navigation";

export default function AnalyticsPage() {
  redirect("/applications?view=insights");
}
