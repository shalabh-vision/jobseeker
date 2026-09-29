import { redirect } from "next/navigation";

// The app opens on the guide to how everything works.
export default function Home() {
  redirect("/help");
}
