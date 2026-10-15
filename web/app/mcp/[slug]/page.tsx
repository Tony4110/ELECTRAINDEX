import type { Metadata } from "next";
import { toolPageV2 } from "@/lib/rollout";
import { metadataV1, ToolPageV1 } from "./v1";
import { metadataV2, ToolPageV2 } from "./v2";

type Props = { params: Promise<{ slug: string }> };

// rendered on first visit, then cached and refreshed hourly
export async function generateStaticParams() { return []; }

export async function generateMetadata(props: Props): Promise<Metadata> {
  return toolPageV2((await props.params).slug) ? metadataV2(props) : metadataV1(props);
}

export default async function McpPage(props: Props) {
  return toolPageV2((await props.params).slug) ? ToolPageV2(props) : ToolPageV1(props);
}
