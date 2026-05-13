"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import PricingSection from "./PricingSection";

export default function PricingModal({ subscriptionTier = "free", children }) {
    const [isOpen, setIsOpen] = useState(false);

    // Only allow opening if user is on free plan
    const canOpen = subscriptionTier === "free";

    return (
        <Dialog open={isOpen} onOpenChange={canOpen ? setIsOpen : undefined}>
            <DialogTrigger
                disabled={!canOpen}
                nativeButton={false}
                render={(props) => {
                    if (React.isValidElement(children)) {
                        const childClassName = children.props?.className;
                        return React.cloneElement(children, {
                            ...props,
                            className: [props.className, childClassName]
                                .filter(Boolean)
                                .join(" "),
                        });
                    }

                    return (
                        <span
                            {...props}
                            className={[props.className].filter(Boolean).join(" ")}
                        >
                            {children}
                        </span>
                    );
                }}
            />

            <DialogContent className="p-8 pt-4 sm:max-w-4xl">
                <DialogTitle />
                <div>
                    <PricingSection
                        subscriptionTier={subscriptionTier}
                        isModal={true}
                        onClose={() => setIsOpen(false)}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}