
import type {
  StoryAgeGroup,
  StoryPassage,
} from "@/types/audio";

export const STORY_PASSAGES: Record<
  StoryAgeGroup,
  StoryPassage
> = {
  "5–6": {
    title: "The Red Kite",
    text: "Mia has a red kite. The wind lifts it high. It dips over a tree. Mia runs and laughs. When the wind rests, the kite comes down. Mia folds it and walks home.",
  },

  "7–8": {
    title: "A Home for Pip",
    text: "After the rain, Sam found a small bird beside the garden path. Its wing looked tired, so he called his aunt. They placed the bird in a warm box and brought it to a local animal helper. The next morning, the bird was stronger. Sam watched as it flew from the garden gate and disappeared into the bright sky.",
  },

  "9–10": {
    title: "The Garden Clock",
    text: "Every Saturday, Noor helped her grandfather in the garden. One morning, she noticed that the old clock by the shed had stopped. They opened its wooden case and found a tiny leaf caught between the hands. Noor carefully removed it, and the clock began to tick again. Her grandfather smiled. The garden, he said, had its own way of reminding them to slow down and look closely.",
  },

  "11–12": {
    title: "The Library Window",
    text: "On the way home from school, Eli noticed that the library window was dark. A notice explained that the reading room would close while repairs were made. Instead of waiting for it to reopen, Eli and two friends asked the librarian if they could help. They sorted books, made a list of damaged shelves, and suggested moving the afternoon story group to the community hall. By Friday, the room was ready again. The librarian thanked them, but Eli felt proudest that the younger children never missed story time.",
  },
};
