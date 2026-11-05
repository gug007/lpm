import { lessonThumbnail } from "../lessons";

export function LessonThumbnail({ id }: { id: string }) {
  return (
    <img
      src={lessonThumbnail(id)}
      alt=""
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
      className="h-full w-full object-cover"
    />
  );
}
