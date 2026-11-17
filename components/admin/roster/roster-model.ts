export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export type Player = {
  id: string;
  number: number;
  name: string;
  caption: string | null;
  nationality: string;
  position: Position;
  height: string;
  weight: string;
  hometown: string;
  age: number;
  school: string | null;
  previous_club: string | null;
  photo_url: string;
  active: boolean;
  bio: string | null;
  pronunciation: string | null;
  foot: string | null;
};

export type PlayerForm = Omit<Player, "id" | "active">;

export function emptyPlayer(): PlayerForm {
  return {
    number: 0, name: "", caption: "", nationality: "", position: "Midfielder",
    height: "", weight: "", hometown: "", age: 0,
    school: "", previous_club: "", photo_url: "",
    bio: "", pronunciation: "", foot: "",
  };
}
