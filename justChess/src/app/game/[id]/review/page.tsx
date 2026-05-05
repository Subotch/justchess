/**
 * /game/[id]/review — RSC: загружает данные игры на сервере, передаёт в клиентский ReviewBoard.
 */

import { notFound } from "next/navigation";
import { db } from "@/db";
import { games } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ReviewBoard } from "./ReviewBoard";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id: gameId } = await params;

  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    notFound();
  }

  return <ReviewBoard gameId={gameId} pgn={game.pgn ?? ""} />;
}
