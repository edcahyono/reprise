import type { Metadata } from "next";
import AboutContent from "./about-content";

export const metadata: Metadata = {
  title: "About Reprise",
  description: "About Reprise and its creator, Edward Darin Cahyono 刘言豪.",
};

export default function AboutPage() {
  return <AboutContent />;
}
