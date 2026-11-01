public class PunkteRechner {
  public int auswerten(int runden) {
    int punkte = 0;
    if (runden >= 1) {
      for (int r = 1; r <= runden; r++) {
        if (r % 3 == 0) {
          punkte = punkte + 5;
        } else {
          punkte = punkte + 2;
        }
      }
    } else {
      return 0;
    }
    if (punkte > 10) {
      punkte = punkte + 50;
    }
    return punkte;
  }
}
