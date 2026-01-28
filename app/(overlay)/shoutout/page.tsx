import prisma from "@/lib/db";
import { ShoutoutListener } from "@/app/components/shoutout-listener";

export const dynamic = "force-dynamic";

export default async function ShoutoutPage() {
  const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });
  // Fallback to botUserName if channel is not set, or empty string if neither
  const channel = config?.twitchChannel || config?.botUserName || "";

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        {/* Transparent container */}
        {channel ? (
            <ShoutoutListener channel={channel} />
        ) : (
             <div style={{ color: 'red', padding: 20 }}>Error: Channel not configured</div>
        )}
    </div>
  );
}
