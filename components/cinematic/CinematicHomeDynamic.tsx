"use client";

import nextDynamic from "next/dynamic";

/**
 * CinematicHome in its own chunk. The tenant home route is shared by every club, and Next ships each client component
 * the route can reach to all of them; behind next/dynamic the chunk loads only where it renders (Rose City). It still
 * server-renders, so first paint is unchanged.
 */
const CinematicHomeDynamic = nextDynamic(() => import("./CinematicHome"));
export default CinematicHomeDynamic;
