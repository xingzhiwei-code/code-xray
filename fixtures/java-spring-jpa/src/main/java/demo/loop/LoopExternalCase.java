package demo.loop;

import java.util.List;
import org.springframework.stereotype.Service;

/** oracle: loop-external — UNKNOWN. Receiver type is external; persistence identity unknown. */
@Service
public class LoopExternalCase {

    private final com.example.external.ExternalOrderRepository externalRepository;

    public LoopExternalCase(com.example.external.ExternalOrderRepository externalRepository) {
        this.externalRepository = externalRepository;
    }

    public void restock(List<LoopExternalOrder> orders) {
        for (LoopExternalOrder order : orders) {
            externalRepository.save(order);
        }
    }
}

class LoopExternalOrder {
}
