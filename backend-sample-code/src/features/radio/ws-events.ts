export const WS_PATH = {
  RADIO: "/ws/radio",
} as const;

export const WS_RADIO = {
  STATE: "radio:state" as const,
  TRACKS_UPDATED: "radio:tracks_updated" as const,
  TRACK: "radio:track" as const,
  PLAY: "radio:play" as const,
  PAUSE: "radio:pause" as const,
  SEEK: "radio:seek" as const,
  QUEUE_SET: "radio:queue_set" as const,
};
