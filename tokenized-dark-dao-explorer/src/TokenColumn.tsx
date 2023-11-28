import { FC } from "react";

interface TokenColumnProps {
  height: number;
  tokenImage: string;
  caption?: string;
}

const TokenColumn: FC<TokenColumnProps> = ({ height, tokenImage, caption }) => {
  return (
    <div className="flex flex-col" style={{ width: "75px" }}>
      <p>{height}</p>
      <div
        className="transition duration-500 bg-repeat-y"
        style={{
          width: "75px",
          height: `${height}px`,
          backgroundImage: "url('" + tokenImage + "')",
          backgroundSize: "75px",
          backgroundPositionY: "bottom",
        }}
      ></div>
      {caption && <p>{caption}</p>}
    </div>
  );
};
export default TokenColumn;
