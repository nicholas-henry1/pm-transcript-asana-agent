# pm-transcript-asana-agent
An event-driven AI agent that automatically captures meeting transcripts, uses Gemini 2.5 Flash to extract PM action items, and routes them directly into Asana.
# 🤖 End-to-End PM Transcript-to-Asana Task Agent (pm-agent-v3)

An automated, event-driven pipeline that captures meeting transcripts via Google Apps Script, uploads them to Google Cloud Storage, uses Vertex AI (Gemini 2.5 Flash) to extract PM-specific action items, and routes them directly into Asana with custom field metrics.





---

## 🛠 Platform Stack & Tools

This system bridges three major ecosystems using lightweight, serverless infrastructure:
* **Google Workspace (Apps Script):** Automates the front-end capture and transmission of meeting logs.
* **Google Cloud Platform (GCP):**
    * *Cloud Storage:* Serves as the raw data lake and triggers downstream events.
    * *Cloud Functions (Gen 2 / Cloud Run):* Handles serverless execution utilizing Python 3.10.
    * *Vertex AI (Gemini 2.5 Flash):* High-speed, low-latency LLM engine utilizing strict JSON schema enforcement.
* **Asana API:** The target project management system utilizing raw REST endpoints over HTTP.

---

## 🧭 System Architecture

The workflow is a completely hands-off loop across platforms:

1. **Capture & Ship (Apps Script):** A Google Apps Script triggers upon meeting completion (or via a calendar/drive webhook), captures the transcript text, and executes an authenticated HTTP PUT/POST request to push the file into GCP.
2. **Data Ingestion (GCS):** The transcript (`.txt`, `.md`, `.vtt`) lands in the secure `nick-transcripts-1778251680` Cloud Storage bucket.
3. **Event Trigger:** The bucket fires a real-time Cloud Event that instantly spins up the Python Cloud Function (`pm-agent-v3`).
4. **Idempotency Guard:** The function generates a SHA-256 hash of the filename to check for existing processed markers, ensuring network retries never create duplicate Asana tasks.
5. **AI Processing (Vertex AI):** Gemini 2.5 Flash evaluates the raw transcript text against strict extraction instructions and outputs structured JSON data.
6. **API Dispatch:** The function builds a clean, standardized JSON envelope and dispatches tasks directly to the Asana REST API via `requests`.
7. **Idempotency Finalization:** The function uploads a `.done` metadata marker to the `processed/` folder within the bucket, safely concluding the execution loop.

![System Architecture](./architecture.png)

---

## 🧠 The Vertex AI Core Prompt

The "brain" of the extraction runs on Gemini 2.5 Flash with `temperature=0.1` and a rigid JSON schema. Below are the precise prompt instructions compiled into the engine:

```text
You are a Product Manager task extraction agent for Nick Henry.

Your job is to analyze a meeting transcript and identify follow-up tasks that Nick should own as the Product Manager.

Focus especially on PM responsibilities such as:
- Clarifying requirements
- Following up with stakeholders
- Driving alignment
- Documenting decisions
- Updating roadmaps, briefs, tickets, or artifacts
- Coordinating design, engineering, operations, clinical, or leadership input
- Preparing leadership updates
- Escalating blockers or unresolved decisions
- Creating or refining user stories, acceptance criteria, workflows, or product requirements
- Investigating risks, dependencies, or open questions

Nick may be referred to as:
- Nick, Nicholas, Nicholas Henry, PM, Product, Product Manager, owner, DRI, or "you"

Extract only tasks that require action after the meeting.

A valid task must have at least one of the following:
1. A clear owner of Nick/Product/PM
2. A direct ask to Nick
3. A volunteered commitment by Nick
4. A PM-owned follow-up that is strongly implied by the discussion

Do not extract: Tasks for other people, generic discussion, speculation, or completed actions.

Priority rules:
- Use "high" for blockers, urgent follow-ups, leadership commitments, or tasks needed to unblock others.
- Use "medium" for standard PM follow-ups.
- Use "low" for useful but non-urgent work.

Confidence rules:
- Use "100%" when Nick is directly named or clearly commits.
- Use "75%" when PM ownership is clear or strongly implied but Nick is not directly named.
- Use "50%" when ownership is probable but Nick should verify.
- Use "25%" when ownership is ambiguous or vague.

## ⚙️ Configuration & Environment Variables

The function relies on the following environment variables managed within GCP Cloud Functions:

| Variable Name | Description | Target Value / Format |
| :--- | :--- | :--- |
| **VERTEX_MODEL_NAME** | Underlying LLM engine | `gemini-2.5-flash` |
| **ASANA_WORKSPACE_GID** | Target Asana Workspace ID | `8095055940381` |
| **ASANA_PROJECT_GID** | Target Asana Project ID | `1214640161753134` |
| **ASANA_ACCESS_TOKEN** | Secure Personal Access Token | *Securely stored environment string* |
| **INCLUDE_LOW_CONFIDENCE_TASKS** | Toggle processing for 25% confidence tasks | `true` (testing) or `false` (prod) |

---

## 🛠 How to Force Process/Reprocess a Transcript

Because Cloud Storage triggers are strictly real-time event hooks, transcripts uploaded while the agent is unauthorized or updating will not automatically re-run. You can manually force-trigger processing by overwriting the file on itself using the Google Cloud CLI:

```bash
# 1. List the files in the bucket to pinpoint the exact filename
gcloud storage ls gs://nick-transcripts-1778251680/

# 2. Overwrite the file to trick GCS into firing a fresh webhook event
gcloud storage cp gs://nick-transcripts-1778251680/your_target_transcript.txt gs://nick-transcripts-1778251680/your_target_transcript.txt

# 3. Stream the live logs to verify execution success
gcloud functions logs read pm-agent-v3 --region=us-central1 --limit=15
