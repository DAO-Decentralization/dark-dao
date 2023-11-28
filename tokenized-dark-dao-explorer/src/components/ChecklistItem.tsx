import React from "react";
import { FaSpinner } from "react-icons/fa";

interface ChecklistItemProps {
  step: number;
  currentStep: number;
  children?: React.ReactNode;
}

const ChecklistItem: React.FC<ChecklistItemProps> = ({
  step,
  currentStep,
  children,
}) => {
  if (currentStep < step) {
    return <div>{children}</div>;
  } else if (step == currentStep) {
    return (
      <div className="flex inline-flex items-center">
        <FaSpinner className="animate-spin text-gray-500 mr-2" /> {children}
      </div>
    );
  }
  return <div className="text-green-200">{children}</div>;
};

export default ChecklistItem;
