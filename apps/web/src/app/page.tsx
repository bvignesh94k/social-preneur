import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function HomePage() {
  redirect((await getSessionUser()) ? "/dashboard" : "/sign-in");
}
