import { redirect } from "next/navigation";

// The app opens on the saved searches.
export default function Home() {
  redirect("/searches");
}
