// Shared data model (used by both the browser editor and the server).

export type TemplateId = "library" | "kids";
export type PoseId =
  | "present"
  | "point_up"
  | "book"
  | "heart"
  | "dua"
  | "stop"
  | "welcome"
  | "think";

export interface TimedWord { w: string; s: number; e: number }

export interface Line {
  id: string;
  text: string;
  start: number;          // seconds, relative to the voice audio
  end: number;
  accent?: boolean;       // coloured line (gold in "library", teal in "kids")
  // "kids" template only
  scene?: { icon: string; label: string };   // a new illustration starts with this line (icon === "same" keeps previous scene)
  badge?: string;                            // small secondary label shown from this line
  pose?: PoseId;                             // character pose from this line
}

export interface Card {
  id: string;
  header?: string;
  footer?: string;
  lines: Line[];
}

export interface Project {
  id: string;
  title: string;
  template: TemplateId;
  channelName: string;
  createdAt: string;
  updatedAt: string;
  audio?: { file: string; duration: number };
  timing: { intro: number; hold: number; fade: number };
  cards: Card[];
}

export type JobStatus = "idle" | "running" | "done" | "error";

export interface TranscriptState {
  status: JobStatus;
  model?: string;
  words: TimedWord[];
  text: string;
  error?: string;
  updatedAt?: string;
}

export interface RenderState {
  status: JobStatus;
  progress: number;       // 0..1
  stage?: string;
  output?: string;        // file name inside the project folder
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Asset {
  id: string;
  name: string;
  description?: string;   // semantic description / keywords for the AI Director
  file: string;           // file name inside data/assets/icons
  createdAt: string;
}

export interface Settings {
  channelName: string;
  whisperModel: string;
  renderWorkers: number;
  timing: { intro: number; hold: number; fade: number };
}

export const DEFAULT_SETTINGS: Settings = {
  channelName: "عَرَفْتَ فَالْزَمْ",
  whisperModel: "large-v3-turbo",
  renderWorkers: 3,
  timing: { intro: 3.5, hold: 1, fade: 1.8 },
};

export const TEMPLATES: Record<TemplateId, { name: string; description: string; thumb: string }> = {
  library: {
    name: "المكتبة",
    description: "شخصية ثابتة تقرأ في مكتبة، وترجمة ذهبية أسفل الشاشة.",
    thumb: "/templates/library/thumb.jpg",
  },
  kids: {
    name: "شرح كرتوني",
    description: "خلفية بلون موحد، شخصية تشرح بحركات متفاعلة، ورسومات توضيحية جذابة.",
    thumb: "/templates/kids/thumb.jpg",
  },
};

export const POSES: { id: PoseId; name: string; description: string }[] = [
  { id: "present", name: "يشرح بيده", description: "للشرح العام وتقديم الكلام والبيان" },
  { id: "point_up", name: "يشير لأعلى", description: "عند ذكر الله تعالى، التوحيد، القسم بالله، علو الله" },
  { id: "book", name: "يمسك كتابًا", description: "عند ذكر الراوي، المصنف، التفسير، القرآن، الحديث، العلم" },
  { id: "heart", name: "يده على قلبه", description: "عند ذكر القلب، الإيمان، المحبة، الإحسان، حسن الظن، الإخلاص" },
  { id: "dua", name: "يرفع يديه للدعاء", description: "عند الدعاء، سؤال الله، اللهم، الرجاء، الاستغفار، الاستجابة" },
  { id: "stop", name: "يحذر / ينهى بيده", description: "عند النهي، التحذير، لا تلقوا بأيديكم إلى التهلكة، الخطر، المعاصي" },
  { id: "welcome", name: "يفتح يديه ترحيبًا", description: "عند ذكر السعة، شمول الرحمة، الكرم، العطاء الواسع، كل الخير، البشارة" },
  { id: "think", name: "يتأمل / يتفكر", description: "عند التدبر، التفكر، الحكمة، التساؤل، المعنى العميق، الفهم" },
];

/** Payload consumed by the HTML templates (public/templates/*). */
export interface TemplateTimeline {
  channelName: string;
  introDuration: number;
  audioDuration: number;
  holdAfterAudio: number;
  fadeDuration: number;
  total: number;
  env: number[];
  cards: {
    start: number; end: number; header?: string; footer?: string; footerT?: number;
    lines: { t: number; text: string; ts: number[]; accent?: boolean }[];
  }[];
  scenes: { t: number; end: number; icon: string; iconUrl: string; label: string; badge?: { t: number; text: string } }[];
  poses: { t: number; pose: PoseId }[];
}
