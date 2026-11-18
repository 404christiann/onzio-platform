import { handleVisitorPageRequest } from "@/lib/visitor-page-route";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ page: string }> };
export async function GET(request: Request, context: Context) {
  return handleVisitorPageRequest(request, (await context.params).page, false);
}
export async function POST(request: Request, context: Context) {
  return handleVisitorPageRequest(request, (await context.params).page, true);
}
