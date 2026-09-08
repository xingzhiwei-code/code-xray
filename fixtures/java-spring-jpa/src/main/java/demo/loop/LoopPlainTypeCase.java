package demo.loop;

import java.util.List;
import org.springframework.stereotype.Service;

/** oracle: loop-plain-type — NEGATIVE. Receiver is a plain class, not a Spring Data repository. */
@Service
public class LoopPlainTypeCase {

    private final LoopPlainOrderStore store = new LoopPlainOrderStore();

    public void restock(List<LoopPlainOrder> orders) {
        for (LoopPlainOrder order : orders) {
            store.save(order);
        }
    }
}

class LoopPlainOrderStore {

    public void save(LoopPlainOrder order) {
    }
}

class LoopPlainOrder {
}
