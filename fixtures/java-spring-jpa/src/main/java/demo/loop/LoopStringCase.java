package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-string — NEGATIVE. Repository call text only inside strings/comments. */
@Service
public class LoopStringCase {

    private final LoopStringOrderRepository orderRepository;
    private final StringBuilder notes = new StringBuilder();

    public LoopStringCase(LoopStringOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void describe(List<String> steps) {
        for (String step : steps) {
            // orderRepository.save(order); not a real call
            notes.append("step ").append(step).append(" would call orderRepository.save(order)");
        }
    }
}

interface LoopStringOrderRepository extends JpaRepository<LoopStringOrder, Long> {
}

class LoopStringOrder {
}
