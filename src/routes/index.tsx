import { createFileRoute } from "@tanstack/react-router";
import { GsApp } from "@/components/gs-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GsApp />;
}
