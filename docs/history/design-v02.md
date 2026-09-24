# 拾伴 0.2 design direction

Audience: a Windows user organizing research work with a pet companion. Primary job: inspect today, Todo and DDL, then instruct the assistant without changing context.

Layout: one horizontal navigation with 今天 / Todo / DDL. Gear in the top-right. Main workspace fills the middle. Persistent conversation composer anchors the bottom; conversation history expands upward only when needed. On 今天, show the date, a small completion count and two side-by-side lists. Logs and Agent sources remain reachable from settings, not primary navigation.

    拾伴          今天   Todo   DDL          收起  齿轮
    今天                              9月23日 星期三
    Todo                              DDL
    [action rows]                     [deadline rows]
    ------------------------------------------------
    [conversation history, collapsible]
    与拾伴对话…                  microphone  send

Palette: cloud #f4f7fc, white #ffffff, ink #20293c, muted slate #68758c, cobalt #4865e7, boundary #e6eaf1. The sole chromatic emphasis is interactive cobalt; completion uses a quiet success tone and urgency a restrained coral.

Type: Segoe UI Variable Text with Microsoft YaHei UI for Chinese; medium-weight titles and tabular deadline dates. Native Windows text conventions, no decorative uppercase eyebrows. Body 13–14px, headings 24px, metadata 11–12px.

Alignment: content and form labels left-aligned. Tabs centered as navigation only. Empty states concise, action-oriented, and no taller than needed. Distinguish interactive containers from decorative cards.

Pet: import the user's existing Chestnut without altering pixels. Read canonical spritesheetPath and version; support selecting among local Codex pet directories. Minimal mode is explicitly a separate in-app eyes-only indicator, not a falsely advertised Codex skin. Imported v2 atlases add 16-direction gaze behavior while idle.

Critique before build: the previous version combined cream, green cards, repeated uppercase eyebrows and motivational copy. Those choices obscured the two task tables. Remove those elements rather than just reskinning them. Do not add extra dashboard widgets, a side chat column, or permanent advanced navigation.
