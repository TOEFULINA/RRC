// ---------------------------------------------------------------------------
// About Me content. This is the whole page — the view is layout only, so
// everything you'd ever want to change (a new job, a new client, a new rate
// sheet) is edited here and nowhere else.
//
// Ported from the night-market site's /about page, which is where the copy
// was already written and approved. Same sections, same order, same words.
// ---------------------------------------------------------------------------

export const about = {
  heading: "About Me",
  name: "Lina (Toefu)",
  intro: [
    "Hello! I am Lina, a NYC-based visual artist with almost 10 years of experience. I specialize in all things graphic - anywhere from illustration to action figures (and anything in between).",
    "I am available for hire on a project to project basis or monthly contract.",
    "Contact me for any business inquiries! Price and structure are negotiable per client. :)",
  ],

  // Not rendered — the mark below sits in the frame instead. File is still in
  // /menu/about if the portrait is ever wanted back.
  photo: "/menu/about/profile.png",
  // Shown in the frame at the top of the left rail.
  logo: "/menu/about/logo-px.png",
  location: "Manhattan, NY",

  // `icon` names one of the glyphs drawn in mapView.js — add a glyph there
  // before adding a name here.
  links: [
    { icon: "doc", label: "Resume", href: "https://www.toefu888.com/_files/ugd/4ddd2b_957e41760be544e493c53f524993f088.pdf" },
    { icon: "instagram", label: "Instagram", href: "https://instagram.com/toefulina" },
    { icon: "twitter", label: "Twitter", href: "https://twitter.com/LUVsicHEXALOGY" },
    { icon: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/miuppa/" },
    { icon: "nova", label: "Nova", href: "https://www.itsnova.com/toefu?tab=work" },
    { icon: "mail", label: "miuppa13@gmail.com", href: "mailto:miuppa13@gmail.com" },
  ],

  clients: [
    "/menu/about/client-1.png",
    "/menu/about/client-2.png",
    "/menu/about/client-3.png",
    "/menu/about/client-4.png",
    "/menu/about/client-5.png",
    "/menu/about/client-6.png",
  ],

  skills: [
    "Adobe Suite",
    "3D modeling & texturing",
    "Illustration",
    "Tech Pack Production",
    "3D Scanning & Printing",
    "Font/Typography Design",
    "GENAI Integration",
    "Motion Graphics",
    "Photo Retouching",
  ],

  applications: [
    "Ads & Marketing Assets",
    "Social Media Graphics",
    "Product Design & Packaging Design",
    "PDP & Web-ready Commercial Graphics",
    "Action Figure / Toy Design",
    "Web Design",
    "Cover Art",
    "Concept Mockups",
    "Lyric Videos",
    "One Sheets",
  ],

  // The stacked "feed" of update cards down the right side.
  boxes: [
    {
      title: "Rates",
      updated: "Updated 3/7/25",
      body: [
        "Rates are negotiable per client, but I have a consolidated preview sheet of starting rates attached here:",
      ],
      button: { label: "Rates", href: "https://www.toefu888.com/rates" },
    },
    {
      title: "Work Experience",
      updated: "Updated 3/7/25",
      jobs: [
        {
          role: "Freelance",
          dates: "Jan 2018 - Current",
          body: "Specializing in creative direction, illustration, graphic design, merch design, logo design, animation, and 3D Rendering. Clients include Quavo, Anycia, Dess Dior, Kid Cudi, TRGC, Redbull, Warner, Live Nation, and more.",
        },
        {
          role: "Bravest Studios",
          dates: "Apr 2024 - Current",
          body: "Primary in-house graphic and 3d designer for Bravest Studios. Handles a wide range of deliverables including graphic design, brand identity, clothing design, 3d modeling, physical prototyping, animation, and more.",
        },
        {
          role: "Outback Presents",
          dates: "Nov 2021 - Feb 2023",
          body: "Oversaw and executed all graphic design work for signed artists on the Good Partners label, sub-company of tour promoter Outback Presents. Project management for up to 10 artists at a time including: project creative direction and marketing, tour support, and promotional assets (cover art, tour posters, billboard design, social media assets, merchandise like action figures, rugs, and toys).",
        },
      ],
    },
    {
      title: "Skills and Applications",
      updated: "Updated 3/7/25",
      body: [
        "The skills/applications lists to the left are the most common commission requests I work on, and the most common medium types I use on those requests. Not the only things I work on. Feel free to pitch me something beyond that :)",
      ],
    },
    {
      title: "Personal Interests",
      updated: "Updated 5/20/25",
      body: [
        "Nice thanks for making it all the way to the bottom :) I get to tell you about my hobbies here!",
        "In my free time, I love playing games, doing elaborate nail art, and making self portraits. I really don't have much else to say LOL what I do for a living is my biggest hobby.",
      ],
    },
  ],

  footer: ["Toefu LLC", "Lina Art"],
};
