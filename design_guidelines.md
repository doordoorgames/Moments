{
  "design_system_name": "Campfire Engine (Player) + Story Architect (Admin)",
  "brand_attributes": {
    "player": ["warm", "cinematic", "playful", "social", "readable"],
    "admin": ["clinical", "tool-like", "dense", "precise", "fast"],
    "anti_goals": [
      "No neon / cyberpunk",
      "No glassmorphism gimmicks",
      "No 3D",
      "No transparent backgrounds",
      "No generic centered layouts",
      "No purple for player UI"
    ]
  },
  "layout_strategy": {
    "routing": {
      "public": ["/", "/play", "/play/:code"],
      "admin": ["/admin", "/admin/stories", "/admin/stories/:id"]
    },
    "player_mobile_container": {
      "pattern": "single-column, thumb-friendly, bottom-anchored actions",
      "max_width": "max-w-md",
      "padding": "px-4 sm:px-6",
      "vertical_rhythm": "space-y-5",
      "sticky_regions": [
        "Story choices docked to bottom (safe-area aware)",
        "Gate status banner (top)"
      ]
    },
    "admin_desktop_shell": {
      "pattern": "app shell with top bar + left rail + canvas + right inspector",
      "grid": "[LeftRail 260px] [Canvas 1fr] [Inspector 380px]",
      "breakpoints": {
        "lg": "show all panes",
        "md": "collapse left rail into icon-only; inspector becomes Sheet",
        "sm": "admin not optimized; show warning + allow read-only"
      }
    }
  },
  "typography": {
    "google_fonts_import": {
      "note": "Add to index.html <head> or via CSS @import. Keep to 2 families.",
      "families": [
        {
          "name": "Spectral",
          "weights": [400, 500, 600, 700],
          "usage": "Player headings + story text (cinematic editorial)"
        },
        {
          "name": "IBM Plex Sans",
          "weights": [400, 500, 600, 700],
          "usage": "Admin UI + player UI chrome (inputs, labels, meta)"
        }
      ]
    },
    "font_tokens_css": {
      "--font-sans": "\"IBM Plex Sans\", ui-sans-serif, system-ui",
      "--font-serif": "\"Spectral\", ui-serif, Georgia",
      "--tracking-tight": "-0.02em",
      "--leading-story": "1.65"
    },
    "text_size_hierarchy": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl",
      "h2": "text-base md:text-lg",
      "body": "text-sm sm:text-base",
      "small": "text-xs sm:text-sm"
    },
    "type_rules": {
      "player_story_text": "font-[var(--font-serif)] text-[15px] sm:text-base leading-[var(--leading-story)] tracking-[var(--tracking-tight)]",
      "player_ui_text": "font-[var(--font-sans)]",
      "admin_ui_text": "font-[var(--font-sans)] text-[13px] leading-5",
      "numbers_codes": "font-mono tracking-widest"
    }
  },
  "color_system": {
    "note": "Use CSS variables (HSL) in index.css. Keep player light theme default; admin uses .dark class on admin root only.",
    "player_theme_light": {
      "background": "28 33% 97%",
      "foreground": "24 18% 12%",
      "card": "30 40% 98%",
      "card_foreground": "24 18% 12%",
      "popover": "30 40% 98%",
      "popover_foreground": "24 18% 12%",
      "primary": "18 78% 38%",
      "primary_foreground": "30 40% 98%",
      "secondary": "26 28% 92%",
      "secondary_foreground": "24 18% 12%",
      "muted": "26 22% 93%",
      "muted_foreground": "24 10% 40%",
      "accent": "168 35% 34%",
      "accent_foreground": "30 40% 98%",
      "border": "24 18% 86%",
      "input": "24 18% 86%",
      "ring": "18 78% 38%",
      "success": "158 45% 32%",
      "warning": "34 92% 45%",
      "danger": "0 72% 52%",
      "focus": "18 78% 38%"
    },
    "admin_theme_dark": {
      "background": "222 18% 10%",
      "foreground": "210 20% 96%",
      "card": "222 18% 12%",
      "card_foreground": "210 20% 96%",
      "popover": "222 18% 12%",
      "popover_foreground": "210 20% 96%",
      "primary": "210 20% 96%",
      "primary_foreground": "222 18% 10%",
      "secondary": "222 14% 18%",
      "secondary_foreground": "210 20% 96%",
      "muted": "222 14% 18%",
      "muted_foreground": "215 12% 70%",
      "accent": "199 78% 52%",
      "accent_foreground": "222 18% 10%",
      "border": "222 12% 22%",
      "input": "222 12% 22%",
      "ring": "199 78% 52%",
      "success": "158 55% 40%",
      "warning": "34 92% 55%",
      "danger": "0 72% 58%",
      "focus": "199 78% 52%"
    },
    "gradients_and_textures": {
      "restriction": {
        "max_viewport_coverage": "20%",
        "no_text_heavy_areas": true,
        "no_small_elements_under_100px": true,
        "no_stacked_gradients": true,
        "prohibited_examples": [
          "from-blue-500 to-purple-600",
          "from-purple-500 to-pink-500",
          "from-green-500 to-blue-500",
          "from-red-500 to-pink-500"
        ]
      },
      "allowed_player_hero_bg": {
        "tailwind": "bg-[radial-gradient(1200px_circle_at_50%_-10%,hsl(34_92%_85%)/0.55,transparent_55%),radial-gradient(900px_circle_at_20%_10%,hsl(18_78%_70%)/0.25,transparent_60%)]",
        "usage": "Landing + Join only (decorative header band). Keep content cards solid."
      },
      "noise_overlay": {
        "css": "background-image: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"120\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"2\" stitchTiles=\"stitch\"/></filter><rect width=\"120\" height=\"120\" filter=\"url(%23n)\" opacity=\"0.06\"/></svg>');",
        "usage": "Apply to page background wrapper via pseudo-element; never on cards."
      }
    }
  },
  "spacing_and_radius": {
    "spacing_scale": {
      "xs": "2",
      "sm": "3",
      "md": "4",
      "lg": "6",
      "xl": "8",
      "2xl": "12"
    },
    "radius_tokens": {
      "--radius": "0.75rem",
      "--radius-sm": "0.5rem",
      "--radius-lg": "1rem"
    },
    "shadow_tokens": {
      "player_card": "shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)]",
      "admin_panel": "shadow-[0_12px_40px_-24px_rgba(0,0,0,0.65)]",
      "focus_ring": "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    }
  },
  "components": {
    "component_path": {
      "shadcn": "/app/frontend/src/components/ui",
      "primary_components_to_use": [
        "button.jsx",
        "card.jsx",
        "input.jsx",
        "label.jsx",
        "badge.jsx",
        "tabs.jsx",
        "sheet.jsx",
        "dialog.jsx",
        "drawer.jsx",
        "scroll-area.jsx",
        "separator.jsx",
        "progress.jsx",
        "tooltip.jsx",
        "sonner.jsx"
      ]
    },
    "button_system": {
      "shape": "Professional / warm: rounded-md to rounded-lg (8–12px)",
      "variants": {
        "player_primary": "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
        "player_secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        "player_ghost": "bg-transparent hover:bg-muted",
        "admin_primary": "bg-primary text-primary-foreground hover:bg-primary/90",
        "admin_secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        "danger": "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      },
      "motion": {
        "tailwind": "transition-colors duration-150 active:scale-[0.99]",
        "note": "Do not use transition-all."
      },
      "data_testid_examples": [
        "data-testid=\"join-room-submit-button\"",
        "data-testid=\"lobby-start-story-button\"",
        "data-testid=\"story-choice-button-<choiceId>\""
      ]
    },
    "inputs": {
      "room_code": {
        "use": "input-otp.jsx",
        "style": "uppercase tracking-widest",
        "tailwind": "font-mono text-lg",
        "data_testid": "join-room-code-input"
      },
      "nickname": {
        "use": "input.jsx",
        "tailwind": "h-11",
        "data_testid": "join-room-nickname-input"
      },
      "admin_password": {
        "use": "input.jsx",
        "tailwind": "h-10",
        "data_testid": "admin-login-password-input"
      }
    },
    "badges": {
      "gate_badges": {
        "location": "Badge variant=secondary + icon MapPin",
        "vote": "Badge variant=secondary + icon Vote",
        "tailwind": "rounded-full px-2.5 py-0.5"
      },
      "status_badges": {
        "connected": "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/25",
        "waiting": "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/25"
      }
    },
    "cards": {
      "player_story_card": {
        "use": "card.jsx",
        "tailwind": "bg-card text-card-foreground border border-border rounded-[var(--radius-lg)]",
        "inner": "p-5"
      },
      "admin_panel_card": {
        "tailwind": "bg-card border border-border rounded-[var(--radius)]"
      }
    }
  },
  "screen_blueprints": {
    "player": {
      "landing_home": {
        "layout": "Two primary CTAs: Play (primary) + Admin (secondary).",
        "hero": "Warm decorative gradient band + subtle noise; keep below 20% viewport.",
        "content": [
          "Title + 1-line pitch",
          "Primary button: Play",
          "Secondary button: Admin",
          "Small footer links"
        ],
        "data_testids": {
          "play": "landing-play-button",
          "admin": "landing-admin-button"
        }
      },
      "join_room": {
        "layout": "Card with OTP code + nickname + Join. Secondary: Create Room.",
        "components": ["InputOTP", "Input", "Button", "Card"],
        "microcopy": "Keep playful but restrained: 'Pull up a seat. Enter the room code.'",
        "data_testids": {
          "code": "join-room-code-input",
          "nickname": "join-room-nickname-input",
          "join": "join-room-submit-button",
          "create": "create-room-button"
        }
      },
      "lobby": {
        "layout": "Top: room code pill + copy button. Middle: player roster. Bottom: story list cards + Start.",
        "roster": "Use Avatar + name + status dot; show 'Host' badge.",
        "story_cards": "Card list with title, duration, tags, short blurb; selectable radio-group style.",
        "data_testids": {
          "copy_code": "lobby-copy-code-button",
          "player_list": "lobby-player-roster",
          "story_card": "lobby-story-card-<storyId>",
          "start": "lobby-start-story-button"
        }
      },
      "story_reading": {
        "layout": "Top: compact header (story title + progress). Middle: story card scroll. Bottom: choices dock.",
        "story_text": "Serif, generous leading; character label as small caps badge.",
        "choices": "2–4 buttons stacked; primary for recommended path if needed; disable after selection.",
        "motion": "New paragraph fades in (framer-motion) + subtle scroll hint.",
        "data_testids": {
          "story_text": "story-reading-text",
          "choice": "story-choice-button-<choiceId>",
          "progress": "story-progress-indicator"
        }
      },
      "location_gate": {
        "layout": "Gate banner + roster checklist. Big 'Arrived' button.",
        "visual": "Use Progress + list of players with check icons; missing players muted.",
        "data_testids": {
          "arrived": "location-gate-arrived-button",
          "roster": "location-gate-roster",
          "status": "location-gate-status-text"
        }
      },
      "vote_gate": {
        "layout": "Prompt card + options as large buttons; after vote show live tally bars.",
        "tally": "Use Progress component per option + count label; animate width changes.",
        "data_testids": {
          "option": "vote-option-button-<choiceId>",
          "tally": "vote-live-tally",
          "count": "vote-count-<choiceId>"
        }
      },
      "ending": {
        "layout": "Ending title + summary + 'Play again' + 'Back to lobby'.",
        "tone": "Warm, celebratory but not confetti.",
        "data_testids": {
          "ending_title": "ending-title",
          "play_again": "ending-play-again-button",
          "back": "ending-back-to-lobby-button"
        }
      }
    },
    "admin": {
      "admin_login": {
        "layout": "Centered card on dark background; password only.",
        "components": ["Card", "Input", "Button"],
        "data_testids": {
          "password": "admin-login-password-input",
          "submit": "admin-login-submit-button"
        }
      },
      "story_dashboard": {
        "layout": "Top bar (search, new story). Table/list of stories.",
        "components": ["Table", "Input", "Button", "Dialog"],
        "data_testids": {
          "new_story": "admin-new-story-button",
          "search": "admin-story-search-input",
          "story_row": "admin-story-row-<storyId>"
        }
      },
      "canvas_editor": {
        "shell": "Left rail: node palette + minimap toggles. Center: react-flow canvas. Right: inspector panel.",
        "react_flow_styling": {
          "canvas_bg": "bg-[hsl(var(--background))]",
          "grid": "Use subtle dot grid via background-image; keep contrast low.",
          "controls": "Use shadcn Button variants; place top-left.",
          "edges": "Stroke muted-foreground/40; selected edge accent.",
          "selection": "Use ring accent + shadow."
        },
        "node_card_design": {
          "size": "Default 280–320px wide; resizable height.",
          "header": "Title + node type badge (Scene / Gate / Ending) + drag handle icon.",
          "content": "2–4 line clamped preview of story text; list of choices with small handle dots.",
          "footer": "Flags summary chips (requiresFlag, setsFlag, gateType).",
          "handles": "Choice handles on right; input handle on left; make handles 10–12px with visible border.",
          "data_testids": {
            "node": "admin-canvas-node-<nodeId>",
            "handle": "admin-node-handle-<nodeId>-<choiceId>",
            "select": "admin-select-node-<nodeId>"
          }
        },
        "inspector_panel": {
          "pattern": "Sticky right panel with ScrollArea; sections separated by Separator.",
          "sections": [
            "Node meta (title, character)",
            "Story text (Textarea)",
            "Choices (reorderable list; each choice has label + destination + flag rules)",
            "Gate toggles (location/vote)"
          ],
          "data_testids": {
            "panel": "admin-node-inspector-panel",
            "title": "admin-node-title-input",
            "character": "admin-node-character-input",
            "text": "admin-node-text-textarea",
            "add_choice": "admin-add-choice-button",
            "save": "admin-save-node-button"
          }
        }
      }
    }
  },
  "motion_and_microinteractions": {
    "library": "framer-motion (already available)",
    "principles": [
      "Use motion for state changes: join->lobby, new story paragraph, vote tally updates",
      "Keep durations short (150–220ms) and easing natural (easeOut)",
      "Respect prefers-reduced-motion"
    ],
    "recipes": {
      "page_enter": "initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.18,ease:[0.16,1,0.3,1]}}",
      "choice_press": "whileTap={{scale:0.99}}",
      "vote_tally": "animate width changes; avoid layout shift by fixed row heights"
    }
  },
  "accessibility": {
    "requirements": [
      "WCAG AA contrast for text on backgrounds",
      "Visible focus rings on all interactive elements",
      "Touch targets >= 44px on player UI",
      "Use aria-label for icon-only buttons",
      "Announce gate/vote updates via aria-live regions"
    ],
    "aria_live_testids": {
      "room_status": "room-status-live-region",
      "vote_status": "vote-status-live-region"
    }
  },
  "images": {
    "image_urls": [
      {
        "category": "player_hero_background_optional",
        "description": "Warm campfire bokeh photo used as subtle top header background with heavy blur + low opacity overlay (never behind body text).",
        "url": "https://images.unsplash.com/photo-1525783826280-5a6e928544c3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwxfHx3YXJtJTIwY2FtcGZpcmUlMjBib2tlaCUyMGJhY2tncm91bmR8ZW58MHx8fG9yYW5nZXwxNzgzODc1NjIwfDA&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "player_hero_background_alt",
        "description": "Abstract warm blur background for landing/join header band.",
        "url": "https://images.unsplash.com/photo-1566996533071-2c578080c06e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwyfHx3YXJtJTIwY2FtcGZpcmUlMjBib2tlaCUyMGJhY2tncm91bmR8ZW58MHx8fG9yYW5nZXwxNzgzODc1NjIwfDA&ixlib=rb-4.1.0&q=85"
      },
      {
        "category": "player_hero_background_nature_alt",
        "description": "Warm foliage blur; use only as decorative accent behind header band.",
        "url": "https://images.unsplash.com/photo-1712397046497-c55fa27bb628?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwzfHx3YXJtJTIwY2FtcGZpcmUlMjBib2tlaCUyMGJhY2tncm91bmR8ZW58MHx8fG9yYW5nZXwxNzgzODc1NjIwfDA&ixlib=rb-4.1.0&q=85"
      }
    ]
  },
  "implementation_notes_tailwind": {
    "global_tokens": {
      "where": "/app/frontend/src/index.css",
      "what": [
        "Replace :root tokens with player_theme_light",
        "Keep .dark tokens for admin_theme_dark",
        "Add --font-sans and --font-serif",
        "Set body font-family to var(--font-sans)"
      ]
    },
    "admin_dark_scoping": {
      "rule": "Do NOT make entire app dark. Apply className=\"dark\" only on admin layout root wrapper.",
      "example": "<div className=\"dark min-h-screen bg-background text-foreground\">...admin...</div>"
    },
    "player_story_text_class": "font-[var(--font-serif)] leading-[var(--leading-story)] tracking-[var(--tracking-tight)]",
    "no_transparent_backgrounds": true,
    "js_files_note": "All components are .jsx; keep examples in .jsx and avoid TSX-only patterns."
  },
  "references": {
    "inspiration_search_notes": [
      "Warm minimalism + cinematic storytelling patterns (interactive fiction apps)",
      "React Flow UI patterns: BaseNode header/content/footer + inspector side panel"
    ],
    "urls": [
      "https://reactflow.dev/ui",
      "https://reactflow.dev/examples"
    ]
  },
  "instructions_to_main_agent": [
    "Remove default CRA App.css centering/header styles; do not center the whole app container.",
    "Implement two themes via CSS variables: player light default, admin dark scoped to admin routes.",
    "Use shadcn/ui components from /src/components/ui only (Button, Card, Input, Badge, Progress, Sheet, ScrollArea, Table, Tabs, Sonner).",
    "Player screens: keep single-column max-w-md, bottom-docked choice area, serif story text, warm accents (amber/terracotta) without heavy gradients.",
    "Admin screens: dense app shell with react-flow canvas center and right inspector; use compact typography and clear affordances.",
    "Every interactive element and key info must include data-testid in kebab-case.",
    "Use framer-motion for subtle transitions; respect prefers-reduced-motion.",
    "Avoid transition-all; use transition-colors and specific properties only."
  ],
  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>  \n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
