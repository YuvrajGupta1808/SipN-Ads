import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Link2, Play, Instagram, Youtube } from "lucide-react";
import {
  DraggableCardBody,
  DraggableCardContainer,
} from "@/components/ui/draggable-card";
import showcaseTiktok from "@/assets/showcase-tiktok.jpg";
import showcaseInstagram from "@/assets/showcase-instagram.jpg";
import showcaseYoutube from "@/assets/showcase-youtube.jpg";

const showcaseCards = [
  { image: showcaseTiktok, platform: "TIKTOK", caption: "Trending beverage reel — 2M+ views", icon: Play, rotate: -5 },
  { image: showcaseInstagram, platform: "INSTAGRAM", caption: "Aesthetic flat-lay for café launch", icon: Instagram, rotate: 0 },
  { image: showcaseYoutube, platform: "YOUTUBE", caption: "High-conversion summer campaign", icon: Youtube, rotate: 5 },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-14 py-5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full border-2 border-white/30 bg-secondary flex items-center justify-center shadow-sm">
            <Link2 className="w-4 h-4 text-secondary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">Sip N'ads</span>
        </div>
        <button
          onClick={() => navigate("/chat")}
          className="bg-primary text-primary-foreground font-body font-semibold text-sm px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity"
        >
          Get Started
        </button>
      </nav>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-4">
        {/* Hero */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-display text-5xl sm:text-6xl md:text-8xl font-black text-foreground tracking-tight text-center"
        >
          Sip N'ads
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-3 text-foreground/70 font-body text-base md:text-lg text-center max-w-md"
        >
          Generate scroll-stopping TikTok, Instagram & YouTube video ads — powered by AI
        </motion.p>

        {/* Draggable Cards */}
        <DraggableCardContainer className="flex flex-col md:flex-row gap-5 md:-space-x-10 items-center justify-center mt-10 md:mt-14">
          {showcaseCards.map((card, i) => (
            <motion.div
              key={card.platform}
              initial={{ opacity: 0, y: 40, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: card.rotate }}
              transition={{ duration: 0.6, delay: 0.25 + i * 0.12, ease: "easeOut" }}
            >
              <DraggableCardBody className="w-72 md:w-80">
                <img
                  src={card.image}
                  alt={`${card.platform} ad`}
                  className="w-full h-72 md:h-80 object-cover rounded-xl pointer-events-none"
                  draggable={false}
                />
                <div className="px-2 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <card.icon className="w-4 h-4 text-card-foreground/70" />
                    <span className="font-body font-bold text-xs tracking-[0.18em] text-card-foreground">
                      {card.platform}
                    </span>
                  </div>
                  <p className="text-card-foreground/50 font-body text-xs italic">
                    "{card.caption}"
                  </p>
                </div>
              </DraggableCardBody>
            </motion.div>
          ))}
        </DraggableCardContainer>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          onClick={() => navigate("/chat")}
          className="mt-10 bg-primary text-primary-foreground font-body font-semibold text-sm px-10 py-4 rounded-2xl hover:opacity-90 transition-opacity"
        >
          Get Started
        </motion.button>
      </main>
    </div>
  );
};

export default Index;
