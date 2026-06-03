import { Bookmark, Heart, MessageCircle, Send } from "lucide-react";

export function InstagramActionsBar({ likes }: { likes?: number }) {
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between text-foreground">
        <div className="flex items-center gap-4">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Send className="h-5 w-5" />
        </div>
        <Bookmark className="h-5 w-5" />
      </div>
      {likes ? (
        <p className="text-xs font-semibold">{likes.toLocaleString("pt-BR")} curtidas estimadas</p>
      ) : null}
    </div>
  );
}
