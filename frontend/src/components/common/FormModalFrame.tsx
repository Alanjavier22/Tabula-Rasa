import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Modal from './Modal';

const panelMotion = {
  initial: false,
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 12 },
} as const;

interface FormModalFrameProps {
  isOpen: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export default function FormModalFrame({ isOpen, label, onClose, children }: Readonly<FormModalFrameProps>) {
  return <AnimatePresence>{isOpen && (
    <Modal onClose={onClose} label={label}>
      <motion.div {...panelMotion} className="relative w-full max-w-lg bg-canvas rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
        {children}
      </motion.div>
    </Modal>
  )}</AnimatePresence>;
}
