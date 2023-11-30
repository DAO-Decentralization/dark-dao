import { FC } from "react";

interface TokenColumnProps {
  height: number;
  tokenImage: string;
  caption?: string;
  forceShow?: boolean;
}

const TokenColumn: FC<TokenColumnProps> = ({
  height,
  tokenImage,
  caption,
  forceShow,
}) => {
  return (
    <div
      className={`flex flex-col ${height === 0 && !forceShow ? "hidden" : ""}`}
      style={{ width: "75px" }}
    >
      <p>{height}</p>
      <div
        className="transition duration-500 bg-repeat-y"
        style={{
          width: "75px",
          minHeight: `${height}px`,
          transition: "min-height 1s ease",
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
