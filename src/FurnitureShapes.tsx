export function SofaShape({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-[28%] rounded-t-[6px] bg-[#8a6a4e]" />
      <div className="absolute inset-[18%_6%_8%] rounded-[4px] bg-[#c4a078]" />
      <div className="absolute left-0 top-[22%] h-[70%] w-[12%] rounded-l-[4px] bg-[#9a7a5c]" />
      <div className="absolute right-0 top-[22%] h-[70%] w-[12%] rounded-r-[4px] bg-[#9a7a5c]" />
    </div>
  )
}

export function ChairShape({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <div className="absolute inset-x-[12%] top-0 h-[24%] rounded-t-[5px] bg-[#7d6b52]" />
      <div className="absolute inset-[20%_14%_10%] rounded-[4px] bg-[#b89a72]" />
      <div className="absolute bottom-[8%] left-[6%] top-[28%] w-[12%] rounded-[3px] bg-[#8c775c]" />
      <div className="absolute bottom-[8%] right-[6%] top-[28%] w-[12%] rounded-[3px] bg-[#8c775c]" />
    </div>
  )
}

export function CoffeeTableShape({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-full border-[3px] border-[#c9b496] bg-[#efe4d2] ${className}`}
      aria-hidden="true"
    />
  )
}

export function SideTableShape({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-[4px] border-[3px] border-[#c9b496] bg-[#efe4d2] ${className}`}
      aria-hidden="true"
    />
  )
}
