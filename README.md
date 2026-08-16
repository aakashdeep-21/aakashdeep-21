<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=26&duration=3000&pause=900&color=5CCFE6&center=true&vCenter=true&width=640&lines=Hey%2C+I'm+Aakashdeep+%F0%9F%91%8B;Backend+systems+%C2%B7+Web+%C2%B7+Automation;Currently+building+a+message+broker" alt="Aakashdeep" />

</div>

<br>

<!-- Self-hosted stats card. Rebuilt daily by GitHub Actions and served as a
     static file from this repo — no third-party service in the path.
     Auto-switches with the viewer's GitHub theme. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="dist/stats-midnight.svg">
  <source media="(prefers-color-scheme: light)" srcset="dist/stats-daylight.svg">
  <img alt="Aakashdeep's GitHub statistics" src="dist/stats-midnight.svg">
</picture>

---

## About

I build backend systems and the interfaces on top of them — currently spending
most of my time on distributed messaging infrastructure in Java.

- 🔭 Building **[Streamix](https://github.com/aakashdeep-21/streamix)**, a Kafka-like message broker from scratch
- 🌱 Digging into **[what you're learning right now]**
- 💬 Happy to talk about **distributed systems, Spring Boot, and React**
- 📫 Reach me on [LinkedIn](https://linkedin.com/in/aakashdeep21)

---

## Tools I reach for

<div align="center">

<img src="https://skillicons.dev/icons?i=java,spring,maven,docker,postgres,js,react,nodejs,python,dart,flutter,html,css,git,postman&perline=8" alt="Tech stack" />

</div>

---

## Selected work

### 🌊 [Streamix](https://github.com/aakashdeep-21/streamix) &nbsp;·&nbsp; Java, Spring Boot, Docker

A Kafka-like message broker, built from the ground up. REST API over topics →
partitions → append-only logs, with at-least-once delivery semantics and
per-partition ordering guarantees.

- **Consumer groups with broker-side rebalancing** — clients stay dumb; the broker
  owns assignment, evicts consumers on session timeout, and hands their partitions
  to a new owner that resumes from the last commit
- **Durable offsets** — write-through append-only log per partition plus an offsets
  journal, with startup replay that truncates torn records
- **Deployed on Railway** via a multi-stage Dockerfile, 12-factor config throughout

<br>

**Other projects**

| Project | What it is | Stack |
| --- | --- | --- |
| **[dma-ui](https://github.com/aakashdeep-21/dma-ui)** | Front-end for the DMA platform | JavaScript |
| **[alert-manager-for-price](https://github.com/aakashdeep-21/alert-manager-for-price)** | Watches prices and fires alerts when thresholds are hit | Python |

---

## Elsewhere

<div align="center">

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/aakashdeep21)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/aakashdeep_21)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/aakashdeep-21)

</div>

<div align="center">
<sub>Stats card rebuilds daily via GitHub Actions — no external services in the path.</sub>
</div>
