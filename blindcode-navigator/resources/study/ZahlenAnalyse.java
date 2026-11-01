public class ZahlenAnalyse {
  public int berechne(int n) {
    int summe = 0;
    if (n > 0) {
      for (int i = 1; i <= n; i++) {
        if (i % 2 == 0) {
          summe = summe + i;
        } else {
          summe = summe + 1;
        }
      }
    } else {
      return -1;
    }
    if (summe > 10) {
      summe = summe + 100;
    }
    return summe;
  }
}
