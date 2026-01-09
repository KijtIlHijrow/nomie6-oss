import Location from '../locations/LocationClass'
import type NLog from '../nomie-log/nomie-log'

import { findNearestLocationHeavy } from '../locations/LocationStore'
import locate from '../../modules/locate/locate'
import { getRawPrefs } from '../preferences/Preferences'

/**
 * If the user has enabled location tracking, and we can get a location, then we'll add the location to
 * the log
 * @param {NLog} log - The log we're appending the location to
 * @returns A Promise that resolves to a log
 */
export async function logAppendLocationIfNeeded(log: NLog): Promise<NLog> {
  // Should we locate?
  let prefs = getRawPrefs();
  let shouldLocate = prefs.alwaysLocate;
  if (shouldLocate) {
    try {
      // Add a timeout wrapper to prevent blocking for too long (4 seconds max)
      // This gives the geolocation API (which has a 3-second timeout) time to complete
      const locationPromise = locate()
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Location timeout')), 4000)
      )
      
      // Race between location and timeout (2 seconds max)
      let theLoc: any = await Promise.race([locationPromise, timeoutPromise])
      
      // make it a location
      let location = new Location({ lat: theLoc.latitude, lng: theLoc.longitude })
      // Find any favorited that are super close
      let nearest = findNearestLocationHeavy(location)
      // If we have a nearest and a name
      if (nearest && nearest.name) {
        location.name = nearest.name
      }
      if (location && !log.lat) {
        log.lat = location.lat
        log.lng = location.lng
        log.location = location.name
      }
      // Return the match - or the location if we didnt any favorites
      return log
    } catch (e) {
      // Any location errors (including timeout) - non-fatal, just continue without location
      console.error(`Non-fatal location error`, e.message)
      return log
    }
  } else {
    return log
  }
}
