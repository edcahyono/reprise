"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Language } from "@/lib/ui-language";

export default function AboutContent() {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    queueMicrotask(() => {
      try { if (window.localStorage.getItem("reprise-language") === "zh") setLanguage("zh"); } catch { /* Show English if storage is unavailable. */ }
    });
  }, []);
  useEffect(() => { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; }, [language]);
  const zh = language === "zh";
  return <main className="studio experiment-shell"><div className="content experiment-page about-page">
    <nav className="topbar" aria-label={zh ? "关于页面导航" : "About navigation"}><Link className="reprise-wordmark" href="/" aria-label={zh ? "返回 Reprise" : "Return to Reprise"}>REPRISE</Link><Link className="subtle-link" href="/">{zh ? "打开实验" : "Open the experiment"} <ArrowRight size={15} /></Link></nav>
    <section className="about-content" aria-labelledby="about-title">
      <p className="about-kicker">{zh ? "关于项目" : "ABOUT THE PROJECT"}</p>
      <h1 id="about-title">{zh ? "更清楚地了解实验如何运行。" : "A closer look at how experiments work."}</h1>
      <p>{zh ? "Reprise 是一个重建已发表行为实验的工作区。它依据论文和补充资料记录每项研究规则的证据，让 AI 模拟受访者完成论文中的选择，并将结果与已发表的人类受访者结果比较。" : "Reprise is a workspace for reconstructing published behavioral experiments from the paper and its supporting materials. It tracks the evidence behind each study rule, runs synthetic AI respondents through documented choices, and compares their results with the published human findings."}</p>
      <p>{zh ? "如果资料缺少问题或实验步骤，Reprise 会清楚标出这些缺口。" : "When a source leaves out a question or procedure, Reprise keeps that gap visible."}</p>
    </section>
    <section className="about-creator" aria-labelledby="creator-title">
      <p className="about-kicker">{zh ? "项目创建者" : "CREATED BY"}</p>
      <h2 id="creator-title">Edward Darin Cahyono <span>刘言豪</span></h2>
      <p>{zh ? "Edward 创建 Reprise，希望让实验方法更易于查阅，并能借助 AI 进行测试。这个项目关注资料证据、可重复的研究流程，以及 AI 模拟结果与原研究结果之间的清楚比较。" : "Edward created Reprise to make experimental methods easier to inspect and test with AI. His work on this project focuses on source evidence, reproducible workflows, and clear comparisons between AI simulations and the original human study."}</p>
    </section>
  </div></main>;
}
