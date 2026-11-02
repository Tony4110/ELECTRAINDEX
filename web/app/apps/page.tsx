import { AppsIndexView, appsIndexMeta } from "@/components/views/apps";
export const revalidate = 3600;
export const metadata = appsIndexMeta("en");
export default function AppsPage() { return <AppsIndexView lang="en" />; }
