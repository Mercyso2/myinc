import { InstagramPostPreview, type InstagramPreviewPost } from "./InstagramPostPreview";

export function InstagramFeedMockup({ post }: { post: InstagramPreviewPost }) {
  return (
    <InstagramPostPreview post={post} aspect={post.format?.includes("quadrado") ? "1/1" : "4/5"} />
  );
}
