public class TempStatistik {
  public int ermittle(int tage) {
    int wert = 0;
    if (tage > 0) {
      for (int t = 1; t <= tage; t++) {
        if (t % 2 == 1) {
          wert = wert + t;
        } else {
          wert = wert + 3;
        }
      }
    } else {
      return -100;
    }
    if (wert > 10) {
      wert = wert + 20;
    }
    return wert;
  }
}
