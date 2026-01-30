import prisma from "@/lib/db";
import MusicPlayer from "@/app/components/music-player";

export const dynamic = "force-dynamic";

export default async function MusicPage() {
  const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });
  const channel = config?.twitchChannel || "";
  const botName = config?.botUserName || "";

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        {channel ? (
            <MusicPlayer channel={channel} botName={botName} />
        ) : (
             <div style={{ color: 'red', padding: 20 }}>Error: Channel not configured</div>
        )}
    </div>
  );
}
