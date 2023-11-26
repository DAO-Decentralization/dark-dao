import { FC } from "react";

interface TokenColumnProps {
  height: number;
  tokenImage: string;
}

const TokenColumn: FC<TokenColumnProps> = ({ height, tokenImage }) => {
  return (
    <div className="flex flex-col">
      <p>{height}</p>
      <div
        className="transition duration-500 bg-repeat-y"
        style={{
          width: "100px",
          height: `${height}px`,
          backgroundImage: "url('" + tokenImage + "')",
          backgroundSize: "100px",
          backgroundPositionY: "bottom",
        }}
      ></div>
    </div>
  );
};
export default TokenColumn;
