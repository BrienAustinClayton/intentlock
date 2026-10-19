import React from "react";

const bar = "rounded-full bg-fg/7 animate-pulse";

export function ChatThreadSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading chat">
      <div className="flex justify-end">
        <div className={`${bar} h-10 w-56 sm:w-72 rounded-3xl`} />
      </div>
      <div className="flex gap-3">
        <span className="hidden sm:block h-8 w-8 shrink-0 rounded-full bg-fg/7 animate-pulse" />
        <div className="flex-1 space-y-3 pt-1">
          <div className={`${bar} h-3.5 w-11/12 max-w-xl`} />
          <div className={`${bar} h-3.5 w-3/5 max-w-md`} />
          <div className="pt-2">
            <ProductCardsSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatHistorySkeleton() {
  return (
    <div className="space-y-1.5 px-2" aria-busy="true" aria-label="Loading chats">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-3 py-2.5 space-y-1.5">
          <div className={`${bar} h-3 w-4/5`} />
          <div className={`${bar} h-2.5 w-3/5`} />
        </div>
      ))}
    </div>
  );
}

export function ProductCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`saas-card flex sm:flex-col overflow-hidden ${i === 1 ? "hidden sm:flex" : ""} ${i === 2 ? "hidden xl:flex" : ""}`}>
          <div className="w-24 shrink-0 sm:w-auto h-24 sm:h-36 bg-fg/5 animate-pulse" />
          <div className="flex-1 p-3.5 space-y-2.5">
            <div className={`${bar} h-3.5 w-4/5`} />
            <div className={`${bar} h-3 w-2/5`} />
            <div className="flex items-center justify-between pt-1">
              <div className={`${bar} h-4 w-14`} />
              <div className={`${bar} h-8 w-24`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
