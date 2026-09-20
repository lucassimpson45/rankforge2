import { Composition } from "remotion";
import { Ranking } from "./Ranking";
import { ranking, buildTimeline } from "./timeline";

export const Root = () => {
  const fps = ranking.fps ?? 30;
  const { totalFrames } = buildTimeline(ranking, fps);
  return (
    <Composition
      id="Ranking"
      component={Ranking}
      width={1080}
      height={1920}
      fps={fps}
      durationInFrames={totalFrames}
      defaultProps={{ ranking }}
    />
  );
};
