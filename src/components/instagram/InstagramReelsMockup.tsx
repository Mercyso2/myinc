import { InstagramStoryMockup } from "./InstagramStoryMockup";
import type { InstagramPreviewPost } from "./InstagramPostPreview";

export function InstagramReelsMockup({ post }: { post: InstagramPreviewPost }) {
  return <InstagramStoryMockup post={post} label="Reels" />;
}
